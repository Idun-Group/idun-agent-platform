"""GCP Trace observability handler."""

from __future__ import annotations

import logging
from typing import Any

from idun_agent_schema.engine.observability_v2 import (
    GCPTraceConfig,
    ObservabilityConfig,
    ObservabilityProvider,
)
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .. import otel_lifecycle
from ..base import ObservabilityHandlerBase

logger = logging.getLogger(__name__)


class GCPTraceHandler(ObservabilityHandlerBase):
    """GCP Trace handler — delegates lifecycle to ``otel_lifecycle``."""

    provider = "gcp_trace"

    def __init__(self, options: dict[str, Any] | None = None):
        super().__init__(options)
        self.options = options or {}

        try:
            from openinference.instrumentation.langchain import LangChainInstrumentor
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
        except ImportError as e:
            logger.error("GCP Trace dependencies not found: %s", e)
            raise ImportError(
                "Please install 'opentelemetry-exporter-gcp-trace' and "
                "'openinference-instrumentation-langchain' to use GCP Trace."
            ) from e

        # Build a typed config so the helper sees the same Resource +
        # Sampler shape it would on a fresh boot. Constructed via
        # ``model_validate`` so the schema's camelCase alias generator
        # doesn't trip mypy on the snake_case kwargs.
        gcp_config = GCPTraceConfig.model_validate(
            {
                "project_id": self.options.get("project_id") or "",
                "region": self.options.get("region") or "",
                "trace_name": self.options.get("trace_name") or "",
                "sampling_rate": float(self.options.get("sampling_rate", 1.0)),
                "flush_interval": int(self.options.get("flush_interval", 5)),
                "ignore_urls": self.options.get("ignore_urls") or "",
            }
        )
        observability = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            enabled=True,
            config=gcp_config,
        )
        otel_lifecycle.init_otel(observability)

        # Exporter + processor — owned by the helper from now on.
        exporter = CloudTraceSpanExporter(project_id=gcp_config.project_id or None)
        flush_interval = gcp_config.flush_interval
        processor = BatchSpanProcessor(
            exporter, schedule_delay_millis=flush_interval * 1000
        )
        otel_lifecycle.attach_span_processor(processor)

        # Instrumentors. Each may be unavailable depending on the user's
        # extras; ImportError on any one is non-fatal — we degrade
        # gracefully (matches existing behaviour).
        otel_lifecycle.attach_instrumentor(LangChainInstrumentor())

        try:
            from openinference.instrumentation.guardrails import (
                GuardrailsInstrumentor,
            )

            otel_lifecycle.attach_instrumentor(GuardrailsInstrumentor())
        except ImportError:
            pass

        try:
            from openinference.instrumentation.vertexai import VertexAIInstrumentor

            otel_lifecycle.attach_instrumentor(VertexAIInstrumentor())
        except ImportError:
            pass

        try:
            from openinference.instrumentation.mcp import MCPInstrumentor

            otel_lifecycle.attach_instrumentor(MCPInstrumentor())
        except ImportError:
            pass

        logger.info(
            "GCP Trace initialized for project: %s",
            gcp_config.project_id or "auto-detected",
        )

    def get_callbacks(self) -> list[Any]:
        """Return callbacks. OTel works via global tracer provider."""
        return []
