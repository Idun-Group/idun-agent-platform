"""GCP Trace observability handler."""

from __future__ import annotations

import logging
from typing import Any

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import TraceIdRatioBased

from ..base import ObservabilityHandlerBase

logger = logging.getLogger(__name__)


class GCPTraceHandler(ObservabilityHandlerBase):
    """GCP Trace handler."""

    provider = "gcp_trace"

    def __init__(self, options: dict[str, Any] | None = None):
        """Initialize handler."""
        super().__init__(options)
        self.options = options or {}

        try:
            from openinference.instrumentation.langchain import LangChainInstrumentor
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
        except ImportError as e:
            logger.error("GCP Trace dependencies not found: %s", e)
            raise ImportError(
                "Please install 'opentelemetry-exporter-gcp-trace' and 'openinference-instrumentation-langchain' to use GCP Trace."
            ) from e

        project_id = self.options.get("project_id")
        if not project_id:
            project_id = None

        # Initialize exporter
        exporter = CloudTraceSpanExporter(
            project_id=project_id,
        )

        # Initialize sampler
        sampling_rate = float(self.options.get("sampling_rate", 1.0))
        sampler = TraceIdRatioBased(sampling_rate)

        # Initialize resource
        resource_attributes = {}
        trace_name = self.options.get("trace_name")
        if trace_name:
            resource_attributes["service.name"] = trace_name

        resource = Resource.create(resource_attributes)

        # Initialize tracer provider
        tracer_provider = TracerProvider(
            sampler=sampler,
            resource=resource,
        )

        # Add span processor
        flush_interval = int(self.options.get("flush_interval", 5))
        span_processor = BatchSpanProcessor(
            exporter, schedule_delay_millis=flush_interval * 1000
        )
        tracer_provider.add_span_processor(span_processor)

        # Set global tracer provider
        trace.set_tracer_provider(tracer_provider)

        # Instrument LangChain with OpenInference
        LangChainInstrumentor().instrument(tracer_provider=tracer_provider)

        # Instrument Guardrails
        try:
            from openinference.instrumentation.guardrails import GuardrailsInstrumentor

            GuardrailsInstrumentor().instrument(tracer_provider=tracer_provider)
        except ImportError:
            pass

        # Instrument VertexAI
        try:
            from openinference.instrumentation.vertexai import VertexAIInstrumentor

            VertexAIInstrumentor().instrument(tracer_provider=tracer_provider)
        except ImportError:
            pass

        # Instrument Google ADK
        try:
            from openinference.instrumentation.google_adk import GoogleADKInstrumentor

            GoogleADKInstrumentor().instrument(tracer_provider=tracer_provider)
        except ImportError:
            pass

        # Instrument MCP
        try:
            from openinference.instrumentation.mcp import MCPInstrumentor

            MCPInstrumentor().instrument(tracer_provider=tracer_provider)
        except ImportError:
            pass

        logger.info("GCP Trace initialized for project: %s", project_id or "auto-detected")

    def get_callbacks(self) -> list[Any]:
        """Return callbacks."""
        # OpenTelemetry instrumentation uses global tracer provider, so no explicit callbacks needed here
        return []
