"""ADK / gen_ai → OpenInference attribute projection.

Maps Google ADK's native span attributes (``gen_ai.*`` semantic
conventions plus ``gcp.vertex.agent.*`` extensions) onto the
OpenInference attribute schema the rest of the platform consumes
(``openinference.span.kind``, ``llm.*``, ``tool.*``, ``input.value``,
``output.value``).

Pure function. No OTel SDK dependency. Source keys are preserved
alongside the projected ones — consumers that read the raw
``gen_ai.*`` keys directly (Langfuse, custom dashboards) are
unaffected.

Companion: design source-of-truth at
``~/Documents/GitHub/idun-dev/tasks/engine-adk-openinference-projection-10-05-2026/SPEC.md``.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

# Provider normalisation map. ``gen_ai.system`` is loose; the
# OpenInference ``llm.provider`` enum is broader. Map values we have
# observed in the wild; pass through anything else unchanged.
_PROVIDER_NORMALISATION: dict[str, str] = {
    "gcp.vertex.agent": "google",
    "openai": "openai",
    "anthropic": "anthropic",
    "vertex_ai": "google",
}


def _projected_kind(
    attrs: Mapping[str, Any], span_name: str
) -> str | None:
    """Determine the OpenInference span kind, or ``None`` if unknown."""
    op = attrs.get("gen_ai.operation.name")
    if op == "invoke_agent":
        return "AGENT"
    if op == "execute_tool":
        return "TOOL"
    if op == "call_llm":
        return "LLM"
    # ADK emits the bare ``call_llm`` name today, but defend against a
    # future variant that suffixes it (parallel to the existing
    # ``invoke_agent <X>`` / ``execute_tool <X>`` patterns) so the UI
    # surface keeps populating LLM columns either way.
    if span_name == "call_llm" or span_name.startswith("call_llm "):
        return "LLM"
    if span_name.startswith("invoke_agent "):
        return "AGENT"
    if span_name.startswith("execute_tool "):
        return "TOOL"
    return None


def _project_llm(
    attrs: Mapping[str, Any], out: dict[str, Any]
) -> None:
    """LLM projection — model, provider, tokens, finish reason, I/O."""
    system = attrs.get("gen_ai.system")
    if isinstance(system, str):
        out.setdefault("llm.system", system)
        out.setdefault(
            "llm.provider", _PROVIDER_NORMALISATION.get(system, system)
        )

    model = attrs.get("gen_ai.request.model")
    if isinstance(model, str):
        out.setdefault("llm.model_name", model)

    # ``isinstance(x, int)`` matches ``True`` / ``False`` because
    # ``bool`` subclasses ``int``. Reject bools and negatives so a
    # buggy instrumentor cannot poison cost computation downstream.
    prompt = attrs.get("gen_ai.usage.input_tokens")
    completion = attrs.get("gen_ai.usage.output_tokens")
    prompt_ok = (
        isinstance(prompt, int) and not isinstance(prompt, bool) and prompt >= 0
    )
    completion_ok = (
        isinstance(completion, int)
        and not isinstance(completion, bool)
        and completion >= 0
    )
    if prompt_ok:
        out.setdefault("llm.token_count.prompt", prompt)
    if completion_ok:
        out.setdefault("llm.token_count.completion", completion)
    if prompt_ok and completion_ok:
        out.setdefault("llm.token_count.total", prompt + completion)  # type: ignore[operator]

    reasons = attrs.get("gen_ai.response.finish_reasons")
    if isinstance(reasons, list) and reasons and isinstance(reasons[0], str):
        out.setdefault("llm.finish_reason", reasons[0])

    request = attrs.get("gcp.vertex.agent.llm_request")
    if isinstance(request, str) and request:
        out.setdefault("input.value", request)
        out.setdefault("input.mime_type", "application/json")

    response = attrs.get("gcp.vertex.agent.llm_response")
    if isinstance(response, str) and response:
        out.setdefault("output.value", response)
        out.setdefault("output.mime_type", "application/json")


def _project_tool(
    attrs: Mapping[str, Any], out: dict[str, Any]
) -> None:
    """TOOL projection — name, parameters, output."""
    name = attrs.get("gen_ai.tool.name")
    if isinstance(name, str):
        out.setdefault("tool.name", name)

    params = attrs.get("gcp.vertex.agent.tool_call_args")
    if isinstance(params, str) and params:
        out.setdefault("tool.parameters", params)

    response = attrs.get("gcp.vertex.agent.tool_response")
    if isinstance(response, str) and response:
        out.setdefault("output.value", response)
        out.setdefault("output.mime_type", "application/json")


def project_to_openinference(
    attrs: Mapping[str, Any], *, span_name: str
) -> dict[str, Any]:
    """Project ADK / gen_ai attributes onto the OpenInference schema.

    Returns a new dict containing the union of source keys and
    projected keys. The function is a no-op (returns a copy of the
    input) when ``openinference.span.kind`` is already set in the
    input — LangGraph spans pass through bit-identical.

    Args:
        attrs: Source span attributes (typically a dict, but any
            ``Mapping`` works).
        span_name: The OTel span name. Required for the prefix-based
            kind discriminator that fires when ``gen_ai.operation.name``
            is absent.

    Returns:
        A new dict with both source and projected keys. Existing
        OpenInference keys in the input take precedence over their
        gen_ai counterparts (``setdefault`` semantics).
    """
    out: dict[str, Any] = dict(attrs)

    if "openinference.span.kind" in out:
        return out

    kind = _projected_kind(attrs, span_name)
    if kind is None:
        return out

    out["openinference.span.kind"] = kind
    if kind == "LLM":
        _project_llm(attrs, out)
    elif kind == "TOOL":
        _project_tool(attrs, out)

    return out
