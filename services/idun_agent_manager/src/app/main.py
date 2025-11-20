"""Main FastAPI application - simplified for development."""

from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from sqlalchemy import text

from app.core.settings import get_settings
from app.infrastructure.db.migrate import auto_migrate
from app.infrastructure.db.session import close_engines, get_async_engine
from app.core.logging import setup_logging, get_logger

# Simple in-memory storage for development
agents_db = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan that verifies DB connectivity and cleans up resources."""
    setup_logging()
    logger = get_logger("app.lifespan")

    logger.info("Starting Idun Agent Manager application")

    # Verify database connectivity on startup
    try:
        engine = get_async_engine()
        start_time = perf_counter()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        elapsed_ms = (perf_counter() - start_time) * 1000
        logger.info("Database connectivity OK", extra={"db_check_ms": round(elapsed_ms, 2)})
    except Exception:
        logger.exception("Database connectivity check failed")
        # Re-raise so the app fails fast if DB is not reachable
        raise

    # Optionally run migrations or create tables
    try:
        logger.info("Starting Alembic migrations")
        settings = get_settings()
        project_root = Path(__file__).resolve().parents[2]
        await auto_migrate(engine, async_db_url=settings.database.url, project_root=project_root, enable_migrate=True)
        logger.info("Alembic migrations completed")
    except Exception:
        logger.exception("Alembic migrations failed")
        raise

    try:
        logger.info("Startup complete")
        yield
    finally:
        # Dispose engines on shutdown
        try:
            await close_engines()
            logger.info("Database engines closed")
        except Exception:
            logger.exception("Error while closing database engines")


def create_app() -> FastAPI:
    """Create a minimal FastAPI application."""

    # Import all DB models early so SQLAlchemy resolves relationships
    import app.infrastructure.db.models  # noqa: F401


    # Create FastAPI app
    app = FastAPI(
        title="Idun Agent Manager API",
        description="Idun service for managing AI agents",
        version="0.1.0", # TODO: add dinamic auto version from pyproject.toml
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Setup CORS
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Setup routes
    setup_routes(app)

    return app


def setup_routes(app: FastAPI) -> None:
    """Setup application routes."""
    # Import minimal routers
    from app.api.v1.routers.agents import router as agents_router
    from app.api.v1.routers.health import router as health_router

    # API v1 routes
    app.include_router(
        agents_router,
        prefix="/api/v1/agents",
        tags=["Agents"],
    )
    app.include_router(
        health_router,
        prefix="/api/v1",
        tags=["Health"],
    )


# Create app instance
app = create_app()


# Root endpoint
@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "name": "Idun Agent Manager API",
        "version": "0.1.0",
        "status": "running",
    }
