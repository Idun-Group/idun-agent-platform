"""First-boot seed.

Seeds the singleton agent plus the optional memory row from
``IDUN_CONFIG_PATH`` if the DB is empty. Schema creation is handled
by Alembic via ``db.migrate.upgrade_head`` before this runs.
"""

from __future__ import annotations

from pathlib import Path

from idun_agent_engine.core.config_builder import ConfigBuilder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from idun_agent_standalone.core.logging import get_logger
from idun_agent_standalone.infrastructure.db.models.agent import StandaloneAgentRow
from idun_agent_standalone.infrastructure.db.models.memory import StandaloneMemoryRow

logger = get_logger(__name__)


async def seed_from_yaml_if_empty(
    sm: async_sessionmaker, config_path: Path
) -> None:
    """Seed the agent (and optional memory) row if the DB has no agent."""
    async with sm() as session:
        existing = (
            await session.execute(select(StandaloneAgentRow))
        ).scalar_one_or_none()
        if existing is not None:
            return

        if not config_path.exists():
            logger.info(
                "No agent row and no config.yaml at %s. Standalone is unconfigured.",
                config_path,
            )
            return

        config = ConfigBuilder.load_from_file(str(config_path))

        agent_config = config.agent.config
        framework = config.agent.type.value

        # Memory lives on its own row. Pull it off the agent config so
        # base_engine_config holds only server + agent fields.
        checkpointer = getattr(agent_config, "checkpointer", None)
        session_service = getattr(agent_config, "session_service", None)
        memory_payload: dict | None = None
        if checkpointer is not None:
            memory_payload = checkpointer.model_dump()
        elif session_service is not None:
            memory_payload = session_service.model_dump()

        inner_dict = agent_config.model_dump(exclude_none=True)
        inner_dict.pop("checkpointer", None)
        inner_dict.pop("session_service", None)

        base_engine_config = {
            "server": config.server.model_dump(),
            "agent": {"type": framework, "config": inner_dict},
        }

        session.add(
            StandaloneAgentRow(
                name=agent_config.name,
                base_engine_config=base_engine_config,
                status="draft",
            )
        )

        if memory_payload is not None:
            session.add(
                StandaloneMemoryRow(
                    id="singleton",
                    agent_framework=framework,
                    memory_config=memory_payload,
                )
            )

        await session.commit()
        logger.info(
            "Seeded standalone DB from %s (name=%s, framework=%s, memory=%s)",
            config_path,
            agent_config.name,
            framework,
            "configured" if memory_payload else "default",
        )
