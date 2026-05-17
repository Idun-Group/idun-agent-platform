"""OpenInference attribute extraction with provider-quirk handling.

Locked source-of-truth for attribute keys:
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/07-openinference-attrs-cheatsheet.md``

Locked provider quirks:
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/10-provider-variance.md``
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _provider_from_model(model: str | None) -> str | None:
    """Heuristic fallback when ``llm.provider`` is missing (OpenRouter case)."""
    if not model:
        return None
    if model.startswith("openrouter/"):
        return "openrouter"
    return None


def extract_llm_span(
    attrs: dict[str, Any], *, streaming: bool = False
) -> dict[str, Any]:
    """Extract canonical LLM-span fields from an OpenInference attrs dict."""
    model = attrs.get("llm.model_name")
    provider = attrs.get("llm.provider") or _provider_from_model(model)

    # Gemini under langchain-google-genai has degraded detail capture.
    if (
        (provider == "google" or attrs.get("llm.system") == "google")
        and model
        and "gemini" in model.lower()
        and not attrs.get("llm.token_count.prompt_details")
    ):
        logger.warning(
            "Gemini span captured via langchain-google-genai has no detail "
            "buckets; recommend openinference-instrumentation-google-genai "
            "for richer capture"
        )

    return {
        "model": model,
        "provider": provider,
        "prompt_tokens": attrs.get("llm.token_count.prompt"),
        "completion_tokens": attrs.get("llm.token_count.completion"),
        "cache_read_tokens": (
            None
            if streaming
            else attrs.get("llm.token_count.prompt_details.cache_read")
        ),
        "cache_write_tokens": (
            None
            if streaming
            else attrs.get("llm.token_count.prompt_details.cache_write")
        ),
    }


def extract_tool_span(attrs: dict[str, Any]) -> dict[str, Any]:
    """Extract canonical TOOL-span fields.

    ``tool.parameters`` is never set by LangChainInstrumentor — arguments
    live in ``output.value`` JSON only. Read defensively because empty
    ``{}`` arguments drop the key entirely.
    """
    output_value = attrs.get("output.value")
    tool_arguments: str | None = None
    if isinstance(output_value, str):
        try:
            payload = json.loads(output_value)
            tool_call = payload.get("tool_call") or {}
            function = tool_call.get("function") or {}
            args = function.get("arguments")
            if isinstance(args, dict):
                tool_arguments = json.dumps(args)
            elif isinstance(args, str):
                tool_arguments = args
            else:
                tool_arguments = "{}"
        except (json.JSONDecodeError, AttributeError):
            tool_arguments = None
    return {
        "tool_name": attrs.get("tool.name"),
        "tool_arguments": tool_arguments,
    }
