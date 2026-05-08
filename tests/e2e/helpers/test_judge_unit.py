"""Unit tests for the judge helper. Stubs the OpenAI client; no real LLM call."""
from __future__ import annotations

import pytest

from tests.e2e.helpers.judge import _parse_verdict


def test_parse_verdict_yes():
    assert _parse_verdict("YES") is True
    assert _parse_verdict("yes") is True
    assert _parse_verdict(" YES \n") is True


def test_parse_verdict_no():
    assert _parse_verdict("NO") is False


def test_parse_verdict_ambiguous_raises():
    with pytest.raises(AssertionError) as exc:
        _parse_verdict("Maybe.")
    assert "Maybe." in str(exc.value)
