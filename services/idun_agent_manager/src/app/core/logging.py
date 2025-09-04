"""Structured logging configuration using structlog."""

import logging
import sys
from typing import Any, Dict

import structlog
from structlog.typing import EventDict

from app.core.settings import get_settings


def add_request_id(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """Add request ID to log events if available."""
    # Try to get request ID from context
    try:
        import contextvars
        request_id = contextvars.ContextVar("request_id", default=None).get()
        if request_id:
            event_dict["request_id"] = request_id
    except (ImportError, LookupError):
        pass
    return event_dict


def add_user_context(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """Add user context to log events if available."""
    try:
        import contextvars
        user_id = contextvars.ContextVar("user_id", default=None).get()
        tenant_id = contextvars.ContextVar("tenant_id", default=None).get()
        
        if user_id:
            event_dict["user_id"] = user_id
        if tenant_id:
            event_dict["tenant_id"] = tenant_id
    except (ImportError, LookupError):
        pass
    return event_dict


def add_trace_context(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """Add OpenTelemetry trace context to log events."""
    try:
        from opentelemetry import trace
        
        span = trace.get_current_span()
        if span and span.is_recording():
            span_context = span.get_span_context()
            event_dict["trace_id"] = format(span_context.trace_id, "032x")
            event_dict["span_id"] = format(span_context.span_id, "016x")
    except ImportError:
        pass
    return event_dict


def configure_logging() -> None:
    """Configure structured logging for the application."""
    settings = get_settings()
    
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.observability.log_level.upper()),
    )
    
    # Common processors
    processors = [
        structlog.contextvars.merge_contextvars,
        add_request_id,
        add_user_context,
        add_trace_context,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
    ]
    
    # Format-specific processors
    if settings.observability.log_format.lower() == "json":
        processors.extend([
            structlog.processors.JSONRenderer()
        ])
    else:
        processors.extend([
            structlog.processors.ExceptionPrettyPrinter(),
            structlog.dev.ConsoleRenderer(colors=not settings.is_production),
        ])
    
    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.observability.log_level.upper())
        ),
        logger_factory=structlog.WriteLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> structlog.BoundLogger:
    """Get a configured logger instance."""
    return structlog.get_logger(name)


# Context variables for request tracking
import contextvars

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id")
user_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("user_id")
tenant_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("tenant_id")


def set_request_context(
    request_id: str,
    user_id: str | None = None,
    tenant_id: str | None = None,
) -> None:
    """Set request context variables."""
    request_id_var.set(request_id)
    if user_id:
        user_id_var.set(user_id)
    if tenant_id:
        tenant_id_var.set(tenant_id)


def get_request_context() -> Dict[str, Any]:
    """Get current request context."""
    context = {}
    
    try:
        context["request_id"] = request_id_var.get()
    except LookupError:
        pass
        
    try:
        context["user_id"] = user_id_var.get()
    except LookupError:
        pass
        
    try:
        context["tenant_id"] = tenant_id_var.get()
    except LookupError:
        pass
        
    return context 