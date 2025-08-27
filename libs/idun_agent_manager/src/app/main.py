"""Main FastAPI application - simplified for development."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Simple in-memory storage for development
agents_db = []


def create_app() -> FastAPI:
    """Create a minimal FastAPI application."""
    
    # Import all DB models early so SQLAlchemy resolves relationships
    import app.infrastructure.db.models  # noqa: F401

    # Create FastAPI app
    app = FastAPI(
        title="Idun Agent Manager API",
        description="Simple API for managing AI agents",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )
    
    # Setup CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # For development only
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
    
    # API v1 routes
    app.include_router(
        agents_router,
        prefix="/api/v1/agents",
        tags=["Agents"],
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