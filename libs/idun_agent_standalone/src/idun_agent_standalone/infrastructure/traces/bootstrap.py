"""Trace-pipeline bootstrap callback.

Registered into ``app.state.post_configure_callbacks``. Runs on every
``configure_app`` — boot AND reload.

Idempotency contract:

* ``otel_lifecycle.shutdown_otel`` (called by the engine's
  ``cleanup_agent`` during reload) drains the previous SpanProcessor
  *and* tears down the TracerProvider. So when this callback fires on
  reload, no TracerProvider is installed.
* The standalone runtime keeps long-lived tasks (the trace writer and
  the retention scheduler) on ``app.state``. On reload we explicitly
  stop the prior instances before respawning so we don't leak them.
* The SpanExporter's queue is process-lived; we deliberately reuse the
  prior exporter instance across reloads when one is on
  ``app.state.trace_exporter`` already, so spans buffered between
  reload start and reload end are not lost.

Telemetry must never alter command/runtime semantics — every step
catches its own failures and logs instead of propagating, matching the
fail-open contract of ``otel_lifecycle.attach_*`` and the writer's
``_drain_once`` loop.

Locked design:
``~/Documents/GitHub/idun-dev/tasks/standalone-traces-trace-pr-09-05-2026/PLAN.md``
    § Phase T7
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/08-otel-pipeline-integration.md``
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from idun_agent_engine.observability import otel_lifecycle
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from . import costs
from .exporter import StandaloneSpanExporter
from .retention import RetentionScheduler
from .writer import TraceWriter

logger = logging.getLogger(__name__)


# Locked BatchSpanProcessor settings — see PLAN T7 Step 1 and the design
# KB § 13-sizing-perf.md. Changing any of these requires re-running the
# throughput probe before merge.
_MAX_QUEUE_SIZE = 8192
_MAX_EXPORT_BATCH_SIZE = 512
_SCHEDULE_DELAY_MILLIS = 2000

# Providers that don't go through OTel — when the user picks one of
# these (or no provider at all) we self-install LangChainInstrumentor
# so the standalone trace store still captures.
_OTEL_BYPASSING_PROVIDERS = frozenset({"LANGFUSE", "LANGSMITH"})


async def attach_trace_pipeline(app: FastAPI) -> None:
    """Attach the standalone trace pipeline to the engine's OTel.

    Order of operations:

    1. Stop the previous writer + retention if this is a reload.
    2. Self-install ``LangChainInstrumentor`` when the active provider
       bypasses OTel (Langfuse / LangSmith) or none is configured.
    3. Ensure a TracerProvider is installed (some providers — Phoenix,
       GCP Trace — install one themselves; we do it ourselves for the
       bypassing-providers case so ``attach_span_processor`` works).
    4. Build a fresh ``BatchSpanProcessor`` wrapping our exporter and
       attach it.
    5. Spawn the writer + retention asyncio tasks.

    Every step is fail-open: a single failure is logged and the rest
    continue, so a misbehaving instrumentor or provider can never
    block engine boot.
    """
    # 1. Reload teardown — stop previous tasks if any.
    await _stop_previous_tasks(app)

    # Resolve trace-pipeline settings off ``app.state``. Falls back to
    # safe defaults when no settings are attached (test harness, very
    # early bootstrap) so the callback stays usable in those contexts.
    settings = getattr(app.state, "settings", None)
    retention_days = getattr(settings, "trace_retention_days", 14)
    max_attribute_bytes = getattr(settings, "traces_input_value_max_bytes", 65536)
    prices_refresh_enabled = getattr(settings, "prices_refresh_enabled", False)
    costs.set_refresh_enabled(bool(prices_refresh_enabled))

    # 2. Resolve the active observability config so we know whether
    #    to self-install LangChainInstrumentor.
    cfg = getattr(app.state, "engine_config", None)
    providers: list[str] = []
    if cfg is not None:
        observability = getattr(cfg, "observability", None) or []
        for entry in observability:
            if not getattr(entry, "enabled", False):
                continue
            provider = getattr(entry, "provider", None)
            if provider is None:
                continue
            providers.append(
                provider.value if hasattr(provider, "value") else str(provider)
            )

    # 3. Ensure a TracerProvider exists. Phoenix/GCP Trace handlers
    #    have already installed one via their own ``init_otel`` call;
    #    in the no-provider / Langfuse / LangSmith case we install a
    #    default provider so attach_span_processor / attach_instrumentor
    #    can register against it.
    if otel_lifecycle.get_tracer_provider() is None:
        try:
            otel_lifecycle.init_otel(None)
        except Exception:
            logger.exception("trace pipeline: init_otel failed; trace capture disabled")
            return

    # 4. Self-install LangChainInstrumentor when no provider OR all
    #    enabled providers bypass OTel.
    if not providers or all(p in _OTEL_BYPASSING_PROVIDERS for p in providers):
        try:
            from openinference.instrumentation.langchain import (
                LangChainInstrumentor,
            )

            otel_lifecycle.attach_instrumentor(LangChainInstrumentor())
            logger.info("trace pipeline: self-installed LangChainInstrumentor")
        except ImportError:
            logger.warning(
                "trace pipeline: openinference.instrumentation.langchain not "
                "installed; LangChain spans will not be captured"
            )
        except Exception:
            logger.exception("trace pipeline: LangChainInstrumentor install failed")

    # 5. Reuse the previously-built exporter when present so its
    #    bounded queue (and any buffered spans) survive reload.
    exporter = getattr(app.state, "trace_exporter", None)
    if not isinstance(exporter, StandaloneSpanExporter):
        exporter = StandaloneSpanExporter(
            max_queue_size=_MAX_QUEUE_SIZE,
            max_attribute_bytes=int(max_attribute_bytes),
        )
        app.state.trace_exporter = exporter

    # 6. New BatchSpanProcessor every time — the prior one was drained
    #    and detached by ``shutdown_otel``.
    try:
        processor = BatchSpanProcessor(
            exporter,
            max_queue_size=_MAX_QUEUE_SIZE,
            max_export_batch_size=_MAX_EXPORT_BATCH_SIZE,
            schedule_delay_millis=_SCHEDULE_DELAY_MILLIS,
        )
        otel_lifecycle.attach_span_processor(processor)
    except Exception:
        logger.exception(
            "trace pipeline: BatchSpanProcessor attach failed; "
            "trace capture disabled"
        )
        return

    # 7. Spawn writer + retention. Both require app.state.sessionmaker.
    session_factory = getattr(app.state, "sessionmaker", None)
    if session_factory is None:
        logger.warning(
            "trace pipeline: app.state.sessionmaker missing; writer + "
            "retention not spawned (spans will queue but never persist)"
        )
        return

    try:
        writer = TraceWriter(
            exporter=exporter,
            session_factory=session_factory,
            max_export_batch_size=_MAX_EXPORT_BATCH_SIZE,
            schedule_delay_millis=_SCHEDULE_DELAY_MILLIS,
        )
        await writer.start()
        app.state.trace_writer_task = writer
    except Exception:
        logger.exception("trace pipeline: writer task failed to start")

    try:
        retention = RetentionScheduler(
            session_factory=session_factory,
            retention_days=int(retention_days),
        )
        await retention.start()
        app.state.trace_retention_task = retention
    except Exception:
        logger.exception("trace pipeline: retention scheduler failed to start")

    logger.info("trace pipeline attached")


async def _stop_previous_tasks(app: FastAPI) -> None:
    """Drain a prior writer + retention if this is a reload.

    Each ``stop()`` is fail-open — a hung task is cancelled by the
    underlying ``asyncio.wait_for`` timeout in the writer/retention
    classes, but a bug there must not stop the bootstrap callback.
    """
    prior_writer = getattr(app.state, "trace_writer_task", None)
    if prior_writer is not None:
        try:
            await prior_writer.stop()
        except Exception:
            logger.exception("trace pipeline: prior writer.stop() raised; continuing")
        app.state.trace_writer_task = None

    prior_retention = getattr(app.state, "trace_retention_task", None)
    if prior_retention is not None:
        try:
            await prior_retention.stop()
        except Exception:
            logger.exception(
                "trace pipeline: prior retention.stop() raised; continuing"
            )
        app.state.trace_retention_task = None
