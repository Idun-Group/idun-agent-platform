"""Alembic environment for database migrations (synchronous engine)."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool
from sqlalchemy.engine import Connection

# Import your models here for autogenerate to work
from app.infrastructure.db.session import Base
from app.infrastructure.db.models.managed_agent import ManagedAgentModel  # noqa: F401
from app.infrastructure.db.models.managed_mcp_server import ManagedMCPServerModel  # noqa: F401
from app.infrastructure.db.models.managed_observability import ManagedObservabilityModel  # noqa: F401
from app.infrastructure.db.models.managed_memory import ManagedMemoryModel  # noqa: F401
from app.infrastructure.db.models.managed_guardrail import ManagedGuardrailModel  # noqa: F401
from app.infrastructure.db.models.managed_sso import ManagedSSOModel  # noqa: F401

# Initialize application logging for Alembic
from app.core.logging import setup_logging
import logging
setup_logging()
logging.getLogger("alembic").propagate = True
# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Override URL from application settings so migrations work in all envs
try:
    from app.core.settings import get_settings

    settings = get_settings()
    if settings and getattr(settings, "database", None):
        # Convert async URL to sync URL for migrations
        # Replace asyncpg with psycopg (v3) dialect
        sync_url = settings.database.url.replace("+asyncpg", "+psycopg").replace("+asyncio", "")
        if sync_url:
            config.set_main_option("sqlalchemy.url", sync_url)
        else:
            raise ValueError("DATABASE__URL is empty or not set in .env file")
except Exception as e:  # pragma: no cover - fallback to alembic.ini if settings unavailable
    import sys
    print(f"Warning: Could not load database URL from settings: {e}", file=sys.stderr)
    print("Make sure DATABASE__URL is set in your .env file", file=sys.stderr)
    # Re-raise if we're in online mode and have no URL
    if not context.is_offline_mode():
        raise

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    url = config.get_main_option("sqlalchemy.url") or ""
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        do_run_migrations(connection)

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
