"""LiteLLM JSON snapshot loader + 4-bucket cost calculator.

Snapshot vendored at ``data/litellm_prices.json``. Refresh monthly via
Dependabot-style PR (no auto-merge — human review). Optional runtime
fetch via ``IDUN_PRICES_REFRESH=true``; falls back to the snapshot on
failure.

Locked design:
``~/Documents/GitHub/idun-dev/tasks/trace-feature-08-05-2026/06-cost-token-capture.md``.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from importlib.resources import files
from typing import Any

logger = logging.getLogger(__name__)

_SNAPSHOT_VERSION = "vendored-2026-05"


@lru_cache(maxsize=1)
def _load_prices() -> dict[str, Any]:
    """Load the LiteLLM prices table.

    If ``IDUN_PRICES_REFRESH=true``, attempt a runtime fetch with a 5 s
    timeout. On any failure, fall back to the vendored snapshot.
    """
    if os.getenv("IDUN_PRICES_REFRESH", "").lower() in {"true", "1"}:
        try:
            import urllib.request

            url = (
                "https://raw.githubusercontent.com/BerriAI/litellm/main/"
                "model_prices_and_context_window.json"
            )
            with urllib.request.urlopen(url, timeout=5) as resp:
                return json.loads(resp.read())
        except Exception:
            logger.exception(
                "IDUN_PRICES_REFRESH fetch failed; using vendored snapshot"
            )
    text = (
        files("idun_agent_standalone.infrastructure.traces.data")
        / "litellm_prices.json"
    ).read_text()
    return json.loads(text)


def snapshot_version() -> str:
    """Stamp value for ``span.cost_source``."""
    return _SNAPSHOT_VERSION


def compute_span_cost(
    *,
    model: str | None,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    cache_read_tokens: int | None,
    cache_write_tokens: int | None,
    streaming: bool = False,
) -> dict[str, Any] | None:
    """Return a 4-bucket cost breakdown, or ``None`` if model is unknown.

    Streaming OpenAI requests drop ``*_details`` token buckets — flag
    ``partial=True`` so the UI renders the cost with a leading ``~``.
    """
    if not model:
        return None
    prices = _load_prices()
    entry = prices.get(model)
    if not entry:
        return None

    prompt_cost = (prompt_tokens or 0) * (entry.get("input_cost_per_token") or 0)
    completion_cost = (completion_tokens or 0) * (
        entry.get("output_cost_per_token") or 0
    )
    cache_read_cost = (cache_read_tokens or 0) * (
        entry.get("cache_read_input_token_cost") or 0
    )
    cache_write_cost = (cache_write_tokens or 0) * (
        entry.get("cache_creation_input_token_cost")
        or entry.get("cache_write_input_token_cost")
        or 0
    )

    return {
        "prompt": prompt_cost,
        "completion": completion_cost,
        "cache_read": cache_read_cost,
        "cache_write": cache_write_cost,
        "total": prompt_cost
        + completion_cost
        + cache_read_cost
        + cache_write_cost,
        "partial": bool(streaming),
    }
