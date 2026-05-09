"""First-boot seed.

Seeds the singleton agent plus the optional memory row from
``IDUN_CONFIG_PATH`` if the DB is empty. Schema creation is handled
by Alembic via ``db.migrate.upgrade_head`` before this runs.

The seeder is split into one ``_seed_<resource>_if_empty`` helper per
resource, called by the ``seed_from_yaml_if_empty`` orchestrator. Each
helper runs under its own try/except so a future per-resource seeder
(observability, guardrails, ...) cannot kill the agent boot if it
explodes — the operator still gets a working agent and a logged error.
"""

from __future__ import annotations

from pathlib import Path

from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_engine.core.engine_config import EngineConfig
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.infrastructure.db.models.mcp_server import (
    StandaloneMCPServerRow,
)
from idun_agent_standalone.infrastructure.db.models.memory import StandaloneMemoryRow
from idun_agent_standalone.infrastructure.db.models.observability import (
    StandaloneObservabilityRow,
)
from idun_agent_standalone.infrastructure.db.models.prompt import StandalonePromptRow
from idun_agent_standalone.infrastructure.db.models.sso import StandaloneSsoRow
from idun_agent_standalone.services.slugs import ensure_unique_slug, normalize_slug

logger = get_logger(__name__)


async def _seed_agent_if_empty(
    session: AsyncSession, engine_config: EngineConfig
) -> int:
    """Seed the singleton agent row from ``engine_config`` if absent.

    Returns the number of rows added (0 or 1) so the orchestrator can
    log a coverage summary at the end of the seed pass.
    """
    existing = (await session.execute(select(StandaloneAgentRow))).scalar_one_or_none()
    if existing is not None:
        return 0

    agent_config = engine_config.agent.config
    framework = engine_config.agent.type.value

    # Memory lives on its own row. Pull it off the agent config so
    # base_engine_config holds only server + agent fields.
    inner_dict = agent_config.model_dump(exclude_none=True)
    inner_dict.pop("checkpointer", None)
    inner_dict.pop("session_service", None)

    base_engine_config = {
        "server": engine_config.server.model_dump(),
        "agent": {"type": framework, "config": inner_dict},
    }

    session.add(
        StandaloneAgentRow(
            name=agent_config.name,
            base_engine_config=base_engine_config,
            status="draft",
        )
    )
    await session.commit()
    return 1


async def _seed_memory_if_empty(
    session: AsyncSession, engine_config: EngineConfig
) -> int:
    """Seed the singleton memory row if the YAML declared one.

    LangGraph configs put the persistence handle under ``checkpointer``;
    ADK configs put it under ``session_service``. Either is mapped onto
    the standalone memory row's ``memory_config`` JSON column. Absence
    means the agent runs on the engine's in-memory default — that is a
    valid configuration, not an error.
    """
    existing = (await session.execute(select(StandaloneMemoryRow))).scalar_one_or_none()
    if existing is not None:
        return 0

    agent_config = engine_config.agent.config
    framework = engine_config.agent.type.value

    checkpointer = getattr(agent_config, "checkpointer", None)
    session_service = getattr(agent_config, "session_service", None)
    memory_payload: dict | None = None
    if checkpointer is not None:
        memory_payload = checkpointer.model_dump()
    elif session_service is not None:
        memory_payload = session_service.model_dump()

    if memory_payload is None:
        return 0

    session.add(
        StandaloneMemoryRow(
            id="singleton",
            agent_framework=framework,
            memory_config=memory_payload,
        )
    )
    await session.commit()
    return 1


async def _seed_prompts_if_empty(
    session: AsyncSession, engine_config: EngineConfig
) -> int:
    """Seed ``StandalonePromptRow`` rows from ``engine_config.prompts``.

    No-op if the YAML omits the ``prompts:`` block or if the prompts
    table already has at least one row (per-resource seed-if-empty
    semantics from SPEC §3). Returns the number of rows written.
    """
    if not engine_config.prompts:
        return 0

    existing_count = await session.scalar(
        select(func.count()).select_from(StandalonePromptRow)
    )
    if existing_count and existing_count > 0:
        logger.info("prompts table non-empty (count=%d); skipping seed", existing_count)
        return 0

    for prompt in engine_config.prompts:
        session.add(
            StandalonePromptRow(
                prompt_id=prompt.prompt_id,
                content=prompt.content,
                version=prompt.version,
                tags=list(prompt.tags or []),
            )
        )
    await session.commit()
    return len(engine_config.prompts)


async def _seed_observability_if_empty(
    session: AsyncSession, engine_config: EngineConfig
) -> int:
    """Seed the singleton ``StandaloneObservabilityRow`` from YAML.

    ``engine_config.observability`` is a ``list[ObservabilityConfig]``;
    standalone is single-tenant and stores at most one provider, so we
    take the first element. The assembly layer
    (``services/engine_config._layer_observability``) wraps it back into
    a one-element list when materializing ``EngineConfig`` at runtime.

    No-op if the singleton row already exists or the YAML omits the
    ``observability:`` block.
    """
    if not engine_config.observability:
        return 0

    existing = await session.get(StandaloneObservabilityRow, "singleton")
    if existing is not None:
        logger.info("observability singleton exists; skipping seed")
        return 0

    first = engine_config.observability[0]
    session.add(
        StandaloneObservabilityRow(
            id="singleton",
            observability_config=first.model_dump(mode="json"),
        )
    )
    await session.commit()
    return 1


async def _seed_sso_if_empty(session: AsyncSession, engine_config: EngineConfig) -> int:
    """Seed the singleton ``StandaloneSsoRow`` from YAML.

    ``engine_config.sso`` is a single ``SSOConfig`` (not a list);
    standalone stores it as a singleton row keyed by ``id="singleton"``.
    The assembly layer (``services/engine_config._layer_sso``) reads the
    row back and layers it onto ``EngineConfig.sso`` at runtime.

    No-op if the singleton row already exists or the YAML omits the
    ``sso:`` block. Absence means SSO is not configured and agent routes
    are unprotected — that is a valid configuration, not an error.
    """
    if engine_config.sso is None:
        return 0

    existing = await session.get(StandaloneSsoRow, "singleton")
    if existing is not None:
        logger.info("sso singleton exists; skipping seed")
        return 0

    session.add(
        StandaloneSsoRow(
            id="singleton",
            sso_config=engine_config.sso.model_dump(mode="json"),
        )
    )
    await session.commit()
    return 1


async def _seed_mcp_servers_if_empty(
    session: AsyncSession, engine_config: EngineConfig
) -> int:
    """Seed ``StandaloneMCPServerRow`` rows from ``engine_config.mcp_servers``.

    No-op if the YAML omits the ``mcp_servers:`` block or if the
    ``standalone_mcp_server`` table already has at least one row
    (per-resource seed-if-empty semantics from SPEC §3). Returns the
    number of rows written.

    Each row gets a slug derived from the MCP server's ``name`` via
    ``ensure_unique_slug``. We ``await session.flush()`` after each
    insert so successive calls to ``ensure_unique_slug`` see the rows
    we have already added in this loop — otherwise duplicate names in
    the same YAML batch would all collapse onto the bare slug and
    violate the unique constraint at commit time.
    """
    mcp_servers = engine_config.mcp_servers
    if not mcp_servers:
        return 0

    existing_count = await session.scalar(
        select(func.count()).select_from(StandaloneMCPServerRow)
    )
    if existing_count and existing_count > 0:
        logger.info(
            "mcp_servers table non-empty (count=%d); skipping seed",
            existing_count,
        )
        return 0

    seeded = 0
    for mcp in mcp_servers:
        candidate = normalize_slug(mcp.name)
        slug = await ensure_unique_slug(
            session,
            StandaloneMCPServerRow,
            StandaloneMCPServerRow.slug,
            candidate,
        )
        session.add(
            StandaloneMCPServerRow(
                name=mcp.name,
                slug=slug,
                enabled=True,
                mcp_server_config=mcp.model_dump(mode="json", exclude_none=True),
            )
        )
        # Flush so ensure_unique_slug on the next iteration sees this
        # row when checking the "is this slug taken" query.
        await session.flush()
        seeded += 1

    await session.commit()
    return seeded


async def seed_from_yaml_if_empty(sm: async_sessionmaker, config_path: Path) -> None:
    """Seed each resource row from YAML if the DB is empty.

    Each per-resource helper runs under its own try/except so an
    isolated failure (e.g. a future observability seeder choking on a
    malformed env var) does not prevent the agent from booting. The
    operator gets a working agent plus a logged error pointing at the
    failed resource.
    """
    if not config_path.exists():
        # Nothing to seed; the operator may be running in fully
        # config-less mode and will use the wizard.
        async with sm() as session:
            existing = (
                await session.execute(select(StandaloneAgentRow))
            ).scalar_one_or_none()
        if existing is None:
            logger.info(
                "No agent row and no config.yaml at %s. Standalone is unconfigured.",
                config_path,
            )
        return

    engine_config = ConfigBuilder.load_from_file(str(config_path))

    seeded: dict[str, int] = {
        "agent": 0,
        "memory": 0,
        "prompts": 0,
        "observability": 0,
        "sso": 0,
        "mcp_servers": 0,
    }

    async with sm() as session:
        try:
            seeded["agent"] = await _seed_agent_if_empty(session, engine_config)
        except Exception:
            logger.exception("Failed to seed agent row from %s", config_path)

    async with sm() as session:
        try:
            seeded["memory"] = await _seed_memory_if_empty(session, engine_config)
        except Exception:
            logger.exception("Failed to seed memory row from %s", config_path)

    async with sm() as session:
        try:
            seeded["prompts"] = await _seed_prompts_if_empty(session, engine_config)
        except Exception:
            logger.exception("Failed to seed prompt rows from %s", config_path)

    async with sm() as session:
        try:
            seeded["observability"] = await _seed_observability_if_empty(
                session, engine_config
            )
        except Exception:
            logger.exception("Failed to seed observability row from %s", config_path)

    async with sm() as session:
        try:
            seeded["sso"] = await _seed_sso_if_empty(session, engine_config)
        except Exception:
            logger.exception("Failed to seed sso row from %s", config_path)

    async with sm() as session:
        try:
            seeded["mcp_servers"] = await _seed_mcp_servers_if_empty(
                session, engine_config
            )
        except Exception:
            logger.exception("Failed to seed mcp_server rows from %s", config_path)

    logger.info(
        "seed complete from %s: agent=%d memory=%d prompts=%d observability=%d "
        "sso=%d mcp_servers=%d",
        config_path,
        seeded["agent"],
        seeded["memory"],
        seeded["prompts"],
        seeded["observability"],
        seeded["sso"],
        seeded["mcp_servers"],
    )
