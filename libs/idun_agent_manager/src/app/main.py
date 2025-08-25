"""Main FastAPI application with instrumentation and setup."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.core.errors import (
    ProblemException,
    http_exception_handler,
    problem_exception_handler,
    validation_exception_handler,
)
from app.core.logging import configure_logging, get_logger, set_request_context
from app.core.settings import get_settings
from app.infrastructure.db.session import close_engines


# Configure logging before any other imports
configure_logging()
logger = get_logger(__name__)


def setup_observability(app: FastAPI) -> None:
    """Setup OpenTelemetry observability."""
    settings = get_settings()
    
    if settings.observability.otel_exporter_endpoint:
        try:
            from opentelemetry import trace
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            
            # Setup trace provider
            trace.set_tracer_provider(TracerProvider())
            tracer = trace.get_tracer(__name__)
            
            # Setup OTLP exporter
            otlp_exporter = OTLPSpanExporter(
                endpoint=settings.observability.otel_exporter_endpoint,
                headers=_parse_headers(settings.observability.otel_exporter_headers),
            )
            
            # Add span processor
            span_processor = BatchSpanProcessor(otlp_exporter)
            trace.get_tracer_provider().add_span_processor(span_processor)
            
            # Instrument FastAPI
            FastAPIInstrumentor.instrument_app(
                app, 
                tracer_provider=trace.get_tracer_provider(),
                excluded_urls="healthz,readyz,metrics"
            )
            
            # Instrument SQLAlchemy
            SQLAlchemyInstrumentor().instrument()
            
            # Instrument HTTPX
            HTTPXClientInstrumentor().instrument()
            
            logger.info("OpenTelemetry instrumentation enabled")
            
        except ImportError:
            logger.warning("OpenTelemetry dependencies not available")


def _parse_headers(headers_str: str | None) -> dict[str, str]:
    """Parse headers string into dictionary."""
    if not headers_str:
        return {}
    
    headers = {}
    for header in headers_str.split(","):
        if "=" in header:
            key, value = header.strip().split("=", 1)
            headers[key] = value
    
    return headers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    settings = get_settings()
    
    logger.info("Starting Idun Agent Manager", version=settings.api.version)
    
    # Setup observability
    setup_observability(app)
    
    yield
    
    # Cleanup
    logger.info("Shutting down Idun Agent Manager")
    await close_engines()


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    settings = get_settings()
    
    # Create FastAPI app
    app = FastAPI(
        title=settings.api.title,
        description=settings.api.description,
        version=settings.api.version,
        docs_url=settings.api.docs_url,
        redoc_url=settings.api.redoc_url,
        openapi_url=settings.api.openapi_url,
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )
    
    # Setup CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api.cors_origins,
        allow_credentials=True,
        allow_methods=settings.api.cors_methods,
        allow_headers=settings.api.cors_headers,
    )
    
    # Setup middleware
    setup_middleware(app)
    
    # Setup exception handlers
    setup_exception_handlers(app)
    
    # Setup routes
    setup_routes(app)
    
    return app


def setup_middleware(app: FastAPI) -> None:
    """Setup application middleware."""
    from uuid import uuid4
    
    @app.middleware("http")
    async def request_middleware(request: Request, call_next):
        """Request middleware for logging and context."""
        # Generate request ID
        request_id = str(uuid4())
        request.state.request_id = request_id
        
        # Set request context for logging
        set_request_context(request_id)
        
        # Log request
        logger.info(
            "Request started",
            method=request.method,
            url=str(request.url),
            user_agent=request.headers.get("user-agent"),
        )
        
        # Process request
        response = await call_next(request)
        
        # Log response
        logger.info(
            "Request completed",
            status_code=response.status_code,
        )
        
        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id
        
        return response


def setup_exception_handlers(app: FastAPI) -> None:
    """Setup exception handlers."""
    from fastapi import HTTPException
    from fastapi.exceptions import RequestValidationError
    
    app.add_exception_handler(ProblemException, problem_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)


def setup_routes(app: FastAPI) -> None:
    """Setup application routes."""
    from app.api.v1.routers.agents import router as agents_router
    from app.api.v1.routers.health import router as health_router
    
    # Health checks
    app.include_router(health_router, tags=["Health"])
    
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
    settings = get_settings()
    return {
        "name": settings.api.title,
        "version": settings.api.version,
        "status": "running",
    } 