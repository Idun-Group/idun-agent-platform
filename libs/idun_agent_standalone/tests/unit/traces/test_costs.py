"""Unit tests for the cost calculator."""

from __future__ import annotations

import pytest
from idun_agent_standalone.infrastructure.traces import costs


class TestCostCalc:
    def test_simple_prompt_completion_cost(self):
        """Plain non-streaming GPT-4o request gets full 4-bucket cost."""
        breakdown = costs.compute_span_cost(
            model="gpt-4o",
            prompt_tokens=1_000,
            completion_tokens=500,
            cache_read_tokens=None,
            cache_write_tokens=None,
        )
        assert breakdown is not None
        assert breakdown["partial"] is False
        # GPT-4o: $2.50/M input, $10/M output (per LiteLLM table)
        # 1k input * $2.50/M = $0.0025; 500 out * $10/M = $0.005
        assert pytest.approx(breakdown["prompt"], rel=1e-2) == 0.0025
        assert pytest.approx(breakdown["completion"], rel=1e-2) == 0.005
        assert pytest.approx(breakdown["total"], rel=1e-2) == 0.0075

    def test_streaming_partial_flag(self):
        """OpenAI streaming drops detail buckets — emits partial=True."""
        breakdown = costs.compute_span_cost(
            model="gpt-4o",
            prompt_tokens=1_000,
            completion_tokens=500,
            cache_read_tokens=None,
            cache_write_tokens=None,
            streaming=True,
        )
        assert breakdown is not None
        assert breakdown["partial"] is True
        assert "cache_read" not in breakdown or breakdown["cache_read"] == 0

    def test_unknown_model_returns_none(self):
        """Unknown model: no cost row, no crash."""
        assert (
            costs.compute_span_cost(
                model="vendor-x-llm-99",
                prompt_tokens=1,
                completion_tokens=1,
                cache_read_tokens=None,
                cache_write_tokens=None,
            )
            is None
        )

    def test_cost_source_is_snapshot_version(self):
        """cost_source returns the snapshot's bundled version stamp."""
        version = costs.snapshot_version()
        assert isinstance(version, str)
        assert len(version) > 0
