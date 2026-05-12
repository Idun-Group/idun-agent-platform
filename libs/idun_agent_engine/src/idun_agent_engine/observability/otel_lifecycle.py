"""Engine OTel resources lifecycle helper.

Owns the engine's TracerProvider, SpanProcessor list, and Instrumentor
list. Centralises lifetime management so reloads don't leak processors
and so the standalone runtime (next PR) can attach its DB exporter via
``attach_span_processor`` from ``post_configure_callbacks``.

Public API:

- ``init_otel(config)`` — install a TracerProvider with Resource +
  Sampler derived from ``config``. Idempotent on identical configs.
- ``attach_span_processor(p)`` — register a SpanProcessor with the
  active provider; tracked for shutdown.
- ``attach_instrumentor(inst)`` — register and ``.instrument()`` an
  OpenInference (or compatible) Instrumentor; tracked for shutdown.
- ``reload_otel(new_config)`` — ``shutdown_otel()`` then
  ``init_otel(new_config)``.
- ``shutdown_otel()`` — best-effort drain of every tracked processor +
  instrumentor. Logs and continues on individual failures.
- ``get_tracer_provider()`` — accessor used by exporters that need a
  tracer.

Telemetry must never alter command/runtime semantics — every public
function catches and logs unexpected errors instead of propagating.
See root CLAUDE.md § Error Handling.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from idun_agent_schema.engine.observability_v2 import (
    GCPTraceConfig,
    ObservabilityConfig,
)
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.sampling import Sampler, TraceIdRatioBased

logger = logging.getLogger(__name__)

# Module-level state. None of this is thread-safe — engine init happens
# on the FastAPI lifespan main task, and reloads happen serially through
# /reload. If that ever changes, lock around the four state vars.
_tracer_provider: TracerProvider | None = None
_attached_processors: list[SpanProcessor] = []
_installed_instrumentors: list[Any] = []  # Instrumentor instances
_init_signature: str | None = None


def _force_set_global_tracer_provider(provider: TracerProvider) -> None:
    """Replace the global TracerProvider, even on a second call.

    OTel's ``trace.set_tracer_provider`` is gated by a ``Once`` flag and
    refuses to override (logs "Overriding of current TracerProvider is
    not allowed" and silently drops the new provider). The helper owns
    the engine's TracerProvider lifecycle and must be able to swap it
    on reload — which is the entire point of this module. We bypass
    the gate by resetting the once-flag, then call ``set_tracer_provider``
    so any other internal accounting still happens.
    """
    try:
        from opentelemetry.util._once import Once

        trace._TRACER_PROVIDER_SET_ONCE = Once()  # noqa: SLF001
    except Exception:
        logger.exception(
            "init_otel: could not reset OTel set-once flag; falling back to "
            "set_tracer_provider (subsequent reload may silently no-op)"
        )
    trace.set_tracer_provider(provider)


def _config_signature(config: ObservabilityConfig | None) -> str:
    """Stable hash of the config used for idempotency checks."""
    if config is None:
        return "<none>"
    payload = json.dumps(
        {
            "provider": config.provider.value,
            "enabled": config.enabled,
            "config": config.config.model_dump(),
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _resource_for(config: ObservabilityConfig | None) -> Resource:
    """Build a Resource with the service.name attribute when known."""
    if config is None:
        return Resource.create({"service.name": "idun-agent-engine"})
    inner = config.config
    name: str | None = None
    if isinstance(inner, GCPTraceConfig) and inner.trace_name:
        name = inner.trace_name
    else:
        run_name = getattr(inner, "run_name", None)
        if isinstance(run_name, str) and run_name:
            name = run_name
    return Resource.create({"service.name": name or "idun-agent-engine"})


def _sampler_for(config: ObservabilityConfig | None) -> Sampler | None:
    """Build a Sampler when the config carries explicit sampling."""
    if config is None:
        return None
    inner = config.config
    if isinstance(inner, GCPTraceConfig):
        return TraceIdRatioBased(float(inner.sampling_rate))
    return None


def init_otel(config: ObservabilityConfig | None) -> None:
    """Install a TracerProvider for the given config.

    Idempotent: a second call with the same config is a no-op.
    A second call with a different config replaces the provider after
    draining the old one (this is the equivalent of reload, and is what
    ``reload_otel`` calls).
    """
    global _tracer_provider, _init_signature

    signature = _config_signature(config)
    if _tracer_provider is not None and _init_signature == signature:
        logger.debug("init_otel: same signature, no-op")
        return

    if _tracer_provider is not None:
        logger.info(
            "init_otel: provider already installed with a different "
            "config; draining and re-initialising"
        )
        _drain_in_place()

    sampler = _sampler_for(config)
    resource = _resource_for(config)
    try:
        _tracer_provider = TracerProvider(sampler=sampler, resource=resource)
    except Exception:
        # Telemetry init must not block agent boot — degrade to off and let
        # the runtime continue. See root CLAUDE.md § Error Handling.
        logger.exception(
            "init_otel: TracerProvider construction failed; observability disabled"
        )
        _tracer_provider = None
        _init_signature = None
        return
    _force_set_global_tracer_provider(_tracer_provider)
    _init_signature = signature
    logger.info(
        "init_otel: TracerProvider installed (provider=%s, sig=%s...)",
        config.provider.value if config else "<none>",
        signature[:8],
    )


def attach_span_processor(processor: SpanProcessor) -> None:
    """Register a SpanProcessor with the active provider.

    Tracked for shutdown. Must be called after ``init_otel``.
    """
    if _tracer_provider is None:
        logger.warning(
            "attach_span_processor: no TracerProvider installed; "
            "init_otel must be called first. Processor=%r ignored.",
            processor,
        )
        return
    try:
        _tracer_provider.add_span_processor(processor)
    except Exception:
        # Same fail-open contract as init_otel: a misbehaving processor
        # must not abort agent boot. The processor is left out of the
        # tracked list so shutdown_otel won't try to drain it.
        logger.exception(
            "attach_span_processor: provider.add_span_processor failed for %r; not tracking",
            processor,
        )
        return
    _attached_processors.append(processor)


def attach_instrumentor(instrumentor: Any, **instrument_kwargs: Any) -> bool:
    """Install an Instrumentor and track it for uninstrumentation.

    The instrumentor must already be instantiated. We call
    ``.instrument(tracer_provider=<active>, **instrument_kwargs)`` and
    remember the instance so ``shutdown_otel`` can call
    ``.uninstrument()``. Extra kwargs forward to the instrumentor
    unchanged so callers can pass instrumentor-specific flags (e.g. the
    OpenInference LangChain instrumentor's
    ``separate_trace_from_runtime_context``).

    Fire-and-forget: if ``.instrument()`` raises, the instrumentor is
    *not* tracked and any partial side-effects (global hooks installed
    before the failure) will not be undone by ``shutdown_otel``. The
    caller is expected to live with that — instrumentor failures here
    are logged and swallowed so a misbehaving instrumentor cannot block
    engine boot. See root CLAUDE.md § Error Handling.

    Returns ``True`` when the instrumentor attached and was tracked,
    ``False`` otherwise (no active TracerProvider, or ``.instrument()``
    raised). Callers that publish a health status to operators (e.g.
    the standalone trace bootstrap) should map ``False`` to
    ``"attach_failed"`` rather than reporting a green state.
    """
    if _tracer_provider is None:
        logger.warning(
            "attach_instrumentor: no TracerProvider installed; "
            "init_otel must be called first. Instrumentor=%r ignored.",
            instrumentor,
        )
        return False
    try:
        instrumentor.instrument(tracer_provider=_tracer_provider, **instrument_kwargs)
    except Exception:
        logger.exception(
            "attach_instrumentor: %r .instrument() failed; not tracking",
            instrumentor,
        )
        return False
    _installed_instrumentors.append(instrumentor)
    return True


def reload_otel(new_config: ObservabilityConfig | None) -> None:
    """Drain the active provider and re-init from ``new_config``."""
    shutdown_otel()
    init_otel(new_config)


def shutdown_otel() -> None:
    """Best-effort drain of every tracked processor + instrumentor.

    Catches and logs every failure so a misbehaving processor cannot
    block engine shutdown or reload. Resets module state. Safe to call
    multiple times in a row.
    """
    _drain_in_place()


def _drain_in_place() -> None:
    """Internal: shut down processors + instrumentors and reset state.

    Used by both ``shutdown_otel`` and ``init_otel`` (the latter when
    swapping provider on a config change).
    """
    global _tracer_provider, _init_signature

    for processor in list(_attached_processors):
        try:
            processor.shutdown()
        except Exception:
            logger.exception(
                "shutdown_otel: processor %r .shutdown() raised; continuing",
                processor,
            )
    _attached_processors.clear()

    for instrumentor in list(_installed_instrumentors):
        try:
            instrumentor.uninstrument()
        except Exception:
            logger.exception(
                "shutdown_otel: instrumentor %r .uninstrument() raised; continuing",
                instrumentor,
            )
    _installed_instrumentors.clear()

    if _tracer_provider is not None:
        # Clear the provider's internal processor list so its own
        # ``shutdown()`` doesn't cascade and re-call shutdown on the
        # processors we just drained above. We need our explicit loop
        # (not the provider cascade) because OTel's MultiSpanProcessor
        # propagates exceptions, while the helper contract is to log
        # and continue.
        try:
            _tracer_provider._active_span_processor._span_processors = ()  # noqa: SLF001
        except Exception:
            logger.exception(
                "shutdown_otel: failed to clear active span processor list; continuing"
            )
        try:
            _tracer_provider.shutdown()
        except Exception:
            logger.exception(
                "shutdown_otel: TracerProvider .shutdown() raised; continuing"
            )
    _tracer_provider = None
    _init_signature = None


def get_tracer_provider() -> TracerProvider | None:
    """Return the currently installed provider, or ``None`` if none."""
    return _tracer_provider
