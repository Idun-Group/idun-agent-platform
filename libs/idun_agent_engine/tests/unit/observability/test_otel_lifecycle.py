"""Tests for the engine's OTel-resources lifecycle helper."""

from __future__ import annotations

import logging

import pytest
from idun_agent_schema.engine.observability_v2 import (
    GCPTraceConfig,
    LangfuseConfig,
    ObservabilityConfig,
    ObservabilityProvider,
)
from opentelemetry import trace
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)


@pytest.fixture(autouse=True)
def _reset_otel_lifecycle():
    """Each test starts with a clean helper module state."""
    from idun_agent_engine.observability import otel_lifecycle

    otel_lifecycle.shutdown_otel()
    yield
    otel_lifecycle.shutdown_otel()


@pytest.mark.unit
class TestInitOtel:
    def test_init_sets_global_tracer_provider(self):
        from idun_agent_engine.observability import otel_lifecycle

        config = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(),
        )
        otel_lifecycle.init_otel(config)

        provider = otel_lifecycle.get_tracer_provider()
        assert provider is not None
        assert trace.get_tracer_provider() is provider

    def test_init_idempotent_with_same_config(self):
        from idun_agent_engine.observability import otel_lifecycle

        config = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(project_id="proj-1"),
        )
        otel_lifecycle.init_otel(config)
        provider_first = otel_lifecycle.get_tracer_provider()

        otel_lifecycle.init_otel(config)
        provider_second = otel_lifecycle.get_tracer_provider()

        assert provider_first is provider_second  # no rebuild on duplicate init

    def test_init_swallows_constructor_exception(self, caplog, monkeypatch):
        """A TracerProvider constructor failure must not abort agent boot."""
        import logging

        from idun_agent_engine.observability import otel_lifecycle

        def _boom(*_a, **_kw):
            raise RuntimeError("simulated TracerProvider failure")

        monkeypatch.setattr(otel_lifecycle, "TracerProvider", _boom)

        config = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(),
        )

        with caplog.at_level(logging.ERROR):
            otel_lifecycle.init_otel(config)  # must not raise

        # Helper degraded gracefully: no provider, no signature, fail-open.
        assert otel_lifecycle.get_tracer_provider() is None
        assert otel_lifecycle._init_signature is None
        assert any(
            "init_otel: TracerProvider construction failed" in rec.message
            for rec in caplog.records
        )


@pytest.mark.unit
class TestAttachSpanProcessor:
    def test_attach_appends_processor_and_tracks_for_shutdown(self):
        from idun_agent_engine.observability import otel_lifecycle

        config = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(),
        )
        otel_lifecycle.init_otel(config)

        exporter = InMemorySpanExporter()
        processor = SimpleSpanProcessor(exporter)
        otel_lifecycle.attach_span_processor(processor)

        # Emit a span and force-flush; the in-memory exporter should see it.
        tracer = otel_lifecycle.get_tracer_provider().get_tracer(__name__)
        with tracer.start_as_current_span("smoke"):
            pass
        otel_lifecycle.get_tracer_provider().force_flush()
        spans = exporter.get_finished_spans()
        assert any(s.name == "smoke" for s in spans)

    def test_attach_swallows_provider_exception(self, caplog):
        """A processor that fails to register must not abort the boot."""
        import logging

        from idun_agent_engine.observability import otel_lifecycle

        config = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(),
        )
        otel_lifecycle.init_otel(config)

        # Force the provider's add_span_processor to raise. Patching the
        # bound method on the live provider is the smallest-blast-radius
        # way to exercise the fail-open path.
        provider = otel_lifecycle.get_tracer_provider()

        def _boom(_processor):
            raise RuntimeError("simulated provider failure")

        provider.add_span_processor = _boom  # type: ignore[method-assign]

        with caplog.at_level(logging.ERROR):
            otel_lifecycle.attach_span_processor(SimpleSpanProcessor(InMemorySpanExporter()))

        # Helper degraded gracefully: nothing tracked, no exception.
        assert otel_lifecycle._attached_processors == []
        assert any(
            "attach_span_processor: provider.add_span_processor failed" in rec.message
            for rec in caplog.records
        )


@pytest.mark.unit
class TestShutdownOtel:
    def test_shutdown_calls_processor_shutdown(self):
        from idun_agent_engine.observability import otel_lifecycle

        config = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(),
        )
        otel_lifecycle.init_otel(config)

        called = {"count": 0}

        class _RecordingProcessor(SpanProcessor):
            def on_start(self, span, parent_context=None):
                pass

            def on_end(self, span):
                pass

            def shutdown(self):
                called["count"] += 1

            def force_flush(self, timeout_millis=None):
                return True

        otel_lifecycle.attach_span_processor(_RecordingProcessor())
        otel_lifecycle.shutdown_otel()

        assert called["count"] == 1

    def test_shutdown_continues_on_processor_failure(self, caplog):
        from idun_agent_engine.observability import otel_lifecycle

        config = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(),
        )
        otel_lifecycle.init_otel(config)

        ok_calls = {"count": 0}

        class _FailingProcessor(SpanProcessor):
            def on_start(self, span, parent_context=None):
                pass

            def on_end(self, span):
                pass

            def shutdown(self):
                raise RuntimeError("boom")

            def force_flush(self, timeout_millis=None):
                return True

        class _OkProcessor(SpanProcessor):
            def on_start(self, span, parent_context=None):
                pass

            def on_end(self, span):
                pass

            def shutdown(self):
                ok_calls["count"] += 1

            def force_flush(self, timeout_millis=None):
                return True

        otel_lifecycle.attach_span_processor(_FailingProcessor())
        otel_lifecycle.attach_span_processor(_OkProcessor())

        with caplog.at_level(logging.ERROR):
            otel_lifecycle.shutdown_otel()  # must not raise

        assert ok_calls["count"] == 1
        assert any("boom" in rec.message or rec.exc_info for rec in caplog.records)

    def test_shutdown_when_uninitialized_is_safe(self):
        from idun_agent_engine.observability import otel_lifecycle

        otel_lifecycle.shutdown_otel()
        otel_lifecycle.shutdown_otel()  # twice in a row, no error


@pytest.mark.unit
class TestReloadOtel:
    def test_reload_drains_old_processors_and_installs_new(self):
        from idun_agent_engine.observability import otel_lifecycle

        config_1 = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(project_id="proj-1"),
        )
        otel_lifecycle.init_otel(config_1)

        old_calls = {"shutdown": 0}

        class _Old(SpanProcessor):
            def on_start(self, span, parent_context=None):
                pass

            def on_end(self, span):
                pass

            def shutdown(self):
                old_calls["shutdown"] += 1

            def force_flush(self, timeout_millis=None):
                return True

        otel_lifecycle.attach_span_processor(_Old())

        config_2 = ObservabilityConfig(
            provider=ObservabilityProvider.LANGFUSE,
            config=LangfuseConfig(),
        )
        otel_lifecycle.reload_otel(config_2)

        assert old_calls["shutdown"] == 1  # old processor was drained
        # Re-init produced a fresh provider — assert it's a TracerProvider
        # (we don't assert distinct identity because LANGFUSE is a no-op
        # provider for OTel and may share state).
        assert isinstance(otel_lifecycle.get_tracer_provider(), TracerProvider)
