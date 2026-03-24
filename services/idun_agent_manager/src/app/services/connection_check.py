"""Lightweight connectivity checks for observability and memory providers."""

import asyncio
import logging
import time

import httpx
from idun_agent_schema.engine.observability_v2 import (
    ObservabilityConfig,
    ObservabilityProvider,
)
from pydantic import BaseModel

logger = logging.getLogger(__name__)

CHECK_TIMEOUT_SECONDS = 10


class ConnectionCheckResponse(BaseModel):
    success: bool
    message: str
    provider: str
    duration_ms: int


async def check_observability(config: ObservabilityConfig) -> ConnectionCheckResponse:
    start = time.monotonic()
    opts = config.config.model_dump()

    try:
        result = await asyncio.wait_for(
            _dispatch_observability(config.provider, opts),
            timeout=CHECK_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        result = (False, f"Connection timed out after {CHECK_TIMEOUT_SECONDS}s")
    except Exception as e:
        logger.debug("Observability check failed", exc_info=True)
        result = (False, f"Connection failed: {type(e).__name__}")

    elapsed = int((time.monotonic() - start) * 1000)
    return ConnectionCheckResponse(
        success=result[0], message=result[1],
        provider=config.provider.value, duration_ms=elapsed,
    )


async def check_memory(config: dict) -> ConnectionCheckResponse:
    start = time.monotonic()
    mem_type = config.get("type", "unknown")

    try:
        result = await asyncio.wait_for(
            _dispatch_memory(config),
            timeout=CHECK_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        result = (False, f"Connection timed out after {CHECK_TIMEOUT_SECONDS}s")
    except Exception as e:
        logger.debug("Memory check failed", exc_info=True)
        result = (False, f"Connection failed: {type(e).__name__}")

    elapsed = int((time.monotonic() - start) * 1000)
    return ConnectionCheckResponse(
        success=result[0], message=result[1], provider=mem_type, duration_ms=elapsed,
    )


async def _dispatch_observability(
    provider: ObservabilityProvider, opts: dict,
) -> tuple[bool, str]:
    match provider:
        case ObservabilityProvider.LANGFUSE:
            return await _check_langfuse(opts)
        case ObservabilityProvider.LANGSMITH:
            return await _check_langsmith(opts)
        case ObservabilityProvider.PHOENIX:
            return await _check_phoenix(opts)
        case ObservabilityProvider.GCP_LOGGING | ObservabilityProvider.GCP_TRACE:
            return (True, "Config format is valid. GCP connectivity check is not supported.")
        case _:
            return (False, f"Unsupported provider: {provider.value}")


async def _dispatch_memory(config: dict) -> tuple[bool, str]:
    match config.get("type", ""):
        case "postgres" | "database":
            return await _check_postgres(config.get("db_url", ""))
        case "sqlite":
            return await _check_sqlite(config.get("db_url", ""))
        case "memory" | "in_memory":
            return (True, "In-memory store is always available")
        case _:
            return (False, f"Unsupported memory type: {config.get('type', '')}")


async def _check_langfuse(opts: dict) -> tuple[bool, str]:
    host = (opts.get("host") or "https://cloud.langfuse.com").rstrip("/")
    public_key = opts.get("public_key", "")
    secret_key = opts.get("secret_key", "")
    if not public_key or not secret_key:
        return (False, "Public key and secret key are required")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{host}/api/public/ingestion",
            auth=(public_key, secret_key),
            json={"batch": []},
        )
        if resp.status_code in (200, 207):
            return (True, "Connected to Langfuse successfully")
        return (False, f"Langfuse returned status {resp.status_code}")


async def _check_langsmith(opts: dict) -> tuple[bool, str]:
    endpoint = (opts.get("endpoint") or "https://api.smith.langchain.com").rstrip("/")
    api_key = opts.get("api_key", "")
    if not api_key:
        return (False, "API key is required")

    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{endpoint}/info", headers={"x-api-key": api_key})
        if resp.status_code == 200:
            return (True, "Connected to LangSmith successfully")
        return (False, f"LangSmith returned status {resp.status_code}")


async def _check_phoenix(opts: dict) -> tuple[bool, str]:
    endpoint = (opts.get("collector_endpoint") or "").rstrip("/")
    if not endpoint:
        return (False, "Collector endpoint is required")

    async with httpx.AsyncClient() as client:
        resp = await client.get(endpoint)
        if resp.status_code == 200:
            return (True, "Connected to Phoenix successfully")
        return (False, f"Phoenix returned status {resp.status_code}")


async def _check_postgres(db_url: str) -> tuple[bool, str]:
    if not db_url:
        return (False, "Database URL is required")
    try:
        import psycopg
    except ImportError:
        return (False, "psycopg is not installed; cannot check PostgreSQL connectivity")
    try:
        async with await psycopg.AsyncConnection.connect(db_url, autocommit=True, connect_timeout=5) as conn:
            await (await conn.execute("SELECT 1")).fetchone()
            return (True, "Connected to PostgreSQL successfully")
    except Exception as e:
        msg = str(e).split("\n")[0]
        return (False, f"PostgreSQL error: {msg}")


async def _check_sqlite(db_url: str) -> tuple[bool, str]:
    if not db_url:
        return (False, "Database URL is required")
    path = db_url.removeprefix("sqlite:///")
    try:
        import aiosqlite
    except ImportError:
        return (False, "aiosqlite is not installed; cannot check SQLite connectivity")
    try:
        async with aiosqlite.connect(path) as db:
            await db.execute("SELECT 1")
            return (True, "Connected to SQLite successfully")
    except Exception as e:
        return (False, f"SQLite error: {e}")
