"""Connection-check probes for memory, observability, and MCP servers.

Each probe runs under ``asyncio.wait_for(..., timeout=5.0)`` and converts
any failure (timeout, exception, malformed config) into a
``StandaloneConnectionCheck`` with ``ok=False`` plus a short, redacted
``error`` string. Probes never raise.

Probes that need cloud credentials (Vertex AI memory, GCP Trace/Logging
observability) validate the config locally and return
``ok=True`` with a ``details.note`` flagging the runtime auth gap, so
running the check in CI/laptop without GCP creds does not fail spuriously.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
from idun_agent_schema.standalone import StandaloneConnectionCheck
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from idun_agent_standalone.core.logging import get_logger

logger = get_logger(__name__)

_DEFAULT_TIMEOUT_S = 5.0


def _ok(details: dict[str, Any] | None = None) -> StandaloneConnectionCheck:
    return StandaloneConnectionCheck(ok=True, details=details, error=None)


def _fail(
    error: str, details: dict[str, Any] | None = None
) -> StandaloneConnectionCheck:
    # Strip newlines from upstream error strings — keeps log + UI tidy.
    return StandaloneConnectionCheck(
        ok=False, details=details, error=error.replace("\n", " ").strip()
    )


# ---- memory ----------------------------------------------------------------


async def check_memory(
    agent_framework: str, memory_config: dict[str, Any]
) -> StandaloneConnectionCheck:
    """Probe a memory backend.

    LangGraph: ``memory`` (in-memory) is trivially OK; ``sqlite`` /
    ``postgres`` open a real connection and run ``SELECT 1``.

    ADK: ``in_memory`` is trivially OK; ``database`` opens a real
    connection; ``vertex_ai`` validates ``project_id`` + ``location`` are
    set and returns OK with a note flagging that real GCP auth was not
    attempted.
    """
    try:
        return await asyncio.wait_for(
            _check_memory_impl(agent_framework, memory_config),
            timeout=_DEFAULT_TIMEOUT_S,
        )
    except TimeoutError:
        return _fail(f"memory check timed out after {_DEFAULT_TIMEOUT_S}s")
    except Exception as exc:
        logger.exception("admin.memory.check unexpected failure")
        return _fail(f"unexpected failure: {type(exc).__name__}: {exc}")


async def _check_memory_impl(
    agent_framework: str, memory_config: dict[str, Any]
) -> StandaloneConnectionCheck:
    type_ = memory_config.get("type")
    if type_ is None:
        return _fail("memory config missing 'type' field")

    fw = agent_framework.upper()
    if fw == "LANGGRAPH":
        if type_ == "memory":
            return _ok({"backend": "in-memory"})
        if type_ in ("sqlite", "postgres"):
            db_url = memory_config.get("db_url") or memory_config.get("dbUrl")
            if not db_url:
                return _fail(f"{type_} memory requires 'db_url'")
            return await _ping_db(db_url, type_)
        return _fail(f"unsupported LangGraph memory type: {type_}")

    if fw == "ADK":
        if type_ == "in_memory":
            return _ok({"backend": "in-memory"})
        if type_ == "database":
            db_url = memory_config.get("db_url") or memory_config.get("dbUrl")
            if not db_url:
                return _fail("database session service requires 'db_url'")
            return await _ping_db(db_url, "database")
        if type_ == "vertex_ai":
            project_id = memory_config.get("project_id") or memory_config.get(
                "projectId"
            )
            location = memory_config.get("location")
            if not project_id or not location:
                return _fail("vertex_ai requires 'project_id' and 'location'")
            return _ok(
                {
                    "backend": "vertex_ai",
                    "projectId": project_id,
                    "location": location,
                    "note": (
                        "config valid; runtime auth check requires GCP credentials"
                    ),
                }
            )
        return _fail(f"unsupported ADK memory type: {type_}")

    return _fail(f"unsupported agent framework: {agent_framework}")


async def _ping_db(db_url: str, backend: str) -> StandaloneConnectionCheck:
    """Open an async SQLAlchemy engine, run SELECT 1, dispose."""
    async_url = _to_async_url(db_url)
    if async_url is None:
        return _fail(f"unsupported db_url scheme for async probe: {db_url}")
    engine = create_async_engine(async_url, future=True)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return _ok({"backend": backend})
    finally:
        await engine.dispose()


def _to_async_url(db_url: str) -> str | None:
    """Best-effort sync→async driver mapping for the probe.

    Returns ``None`` when no async driver is known. The probe surfaces
    that as ``ok=False`` rather than guessing.
    """
    if "+" in db_url.split("://", 1)[0]:
        return db_url
    if db_url.startswith("sqlite://"):
        return db_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    if db_url.startswith(("postgresql://", "postgres://")):
        scheme, rest = db_url.split("://", 1)
        return f"postgresql+asyncpg://{rest}"
    return None


# ---- observability ---------------------------------------------------------


async def check_observability(
    observability_config: dict[str, Any],
) -> StandaloneConnectionCheck:
    """Probe an observability provider.

    Langfuse / Phoenix / LangSmith: HTTP HEAD on the configured endpoint.

    GCP Trace / GCP Logging: validate ``project_id`` and return OK with a
    note flagging that real GCP auth was not attempted.
    """
    try:
        return await asyncio.wait_for(
            _check_observability_impl(observability_config),
            timeout=_DEFAULT_TIMEOUT_S,
        )
    except TimeoutError:
        return _fail(f"observability check timed out after {_DEFAULT_TIMEOUT_S}s")
    except Exception as exc:
        logger.exception("admin.observability.check unexpected failure")
        return _fail(f"unexpected failure: {type(exc).__name__}: {exc}")


async def _check_observability_impl(
    observability_config: dict[str, Any],
) -> StandaloneConnectionCheck:
    provider = observability_config.get("provider")
    if not provider:
        return _fail("observability config missing 'provider' field")

    inner = observability_config.get("config") or {}
    enabled = observability_config.get("enabled", True)
    if not enabled:
        return _ok({"provider": provider, "note": "provider is disabled"})

    if provider == "LANGFUSE":
        host = inner.get("host") or "https://cloud.langfuse.com"
        return await _http_probe(host, {"provider": provider, "host": host})
    if provider == "PHOENIX":
        endpoint = inner.get("collectorEndpoint") or inner.get("collector_endpoint")
        if not endpoint:
            return _fail("PHOENIX provider missing 'collectorEndpoint'")
        return await _http_probe(endpoint, {"provider": provider, "endpoint": endpoint})
    if provider == "LANGSMITH":
        # LangSmith uses smith.langchain.com + an API key. We probe the public
        # endpoint without sending the key — the goal is "is this reachable",
        # not "is this key valid".
        return await _http_probe(
            "https://api.smith.langchain.com",
            {"provider": provider},
        )
    if provider in ("GCP_TRACE", "GCP_LOGGING"):
        project_id = inner.get("project_id") or inner.get("projectId")
        if not project_id:
            return _fail(f"{provider} requires 'project_id'")
        return _ok(
            {
                "provider": provider,
                "projectId": project_id,
                "note": "config valid; runtime auth check requires GCP credentials",
            }
        )
    return _fail(f"unsupported observability provider: {provider}")


async def _http_probe(
    url: str, base_details: dict[str, Any]
) -> StandaloneConnectionCheck:
    """HEAD then GET fallback (some endpoints reject HEAD)."""
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(_DEFAULT_TIMEOUT_S, connect=2.0)
        ) as client:
            response = await client.request("HEAD", url)
            if response.status_code >= 400:
                response = await client.get(url)
            details = {**base_details, "status": response.status_code}
            if response.status_code < 500:
                return _ok(details)
            return _fail(f"upstream returned {response.status_code}", details)
    except httpx.HTTPError as exc:
        return _fail(f"HTTP error: {type(exc).__name__}: {exc}", base_details)


# ---- mcp servers -----------------------------------------------------------


async def check_mcp_server(
    mcp_server_config: dict[str, Any],
) -> StandaloneConnectionCheck:
    """List tools exposed by a single MCP server.

    Doubles as a connection check — if the server can't be reached or
    can't speak MCP, the call surfaces ``ok=False`` with the upstream
    error. ``details.tools`` carries the discovered tool names on success.
    """
    try:
        return await asyncio.wait_for(
            _check_mcp_server_impl(mcp_server_config),
            timeout=_DEFAULT_TIMEOUT_S,
        )
    except TimeoutError:
        return _fail(f"mcp server check timed out after {_DEFAULT_TIMEOUT_S}s")
    except Exception as exc:
        logger.exception("admin.mcp.check unexpected failure")
        return _fail(f"unexpected failure: {type(exc).__name__}: {exc}")


async def _check_mcp_server_impl(
    mcp_server_config: dict[str, Any],
) -> StandaloneConnectionCheck:
    from idun_agent_schema.engine.mcp_server import MCPServer

    try:
        config = MCPServer.model_validate(mcp_server_config)
    except Exception as exc:
        return _fail(f"invalid MCP server config: {exc}")

    # Import the engine registry only after the schema validation pass,
    # so an invalid-config probe never has to load the engine package.
    from idun_agent_engine.mcp.registry import MCPClientRegistry

    registry = MCPClientRegistry([config])
    if not registry.enabled:
        # Init failure recorded in registry.failed
        if registry.failed:
            failure = registry.failed[0]
            return _fail(failure.get("reason", "init failed"))
        return _fail("MCP registry did not initialize")

    tools = await registry.get_tools(name=config.name)
    tool_names = sorted({getattr(t, "name", str(t)) for t in tools})
    return _ok(
        {
            "name": config.name,
            "transport": str(config.transport),
            "tools": tool_names,
            "toolCount": len(tool_names),
        }
    )
