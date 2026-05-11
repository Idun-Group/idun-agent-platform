"""Unit tests for the ADK app-name-mismatch log filter.

The filter exists to suppress the noise from
``google.adk.runners.Runner._enforce_app_name_alignment`` when its
``_infer_agent_origin`` heuristic resolves the agent class to ADK's
own ``google/adk/agents/`` directory — a false-positive that fires
whenever the operator uses the stock ``Agent`` class and runs from a
CWD that contains the venv (typical local-dev case). Genuine
mismatches in the operator's own project tree must still surface.
"""

from __future__ import annotations

import logging

import pytest

from idun_agent_engine.agent.adk.adk import (
    _install_app_name_mismatch_filter,
    _SilenceFalsePositiveAppNameMismatch,
)


def _make_record(message: str, *, name: str = "google_adk.google.adk.runners"):
    return logging.LogRecord(
        name=name,
        level=logging.WARNING,
        pathname=__file__,
        lineno=0,
        msg=message,
        args=None,
        exc_info=None,
    )


def test_drops_false_positive_when_origin_inside_adk_agents_dir() -> None:
    """ADK's own ``site-packages/google/adk/agents`` is the noise case."""
    msg = (
        'App name mismatch detected. The runner is configured with app name '
        '"my_agent", but the root agent was loaded from '
        '"/home/me/.venv/lib/python3.12/site-packages/google/adk/agents", '
        'which implies app name "agents".'
    )
    f = _SilenceFalsePositiveAppNameMismatch()
    assert f.filter(_make_record(msg)) is False


def test_passes_through_genuine_user_side_mismatch() -> None:
    """A mismatch whose origin is the user's project — not ADK's venv
    dir — must still surface; the operator may have a real config
    typo to fix."""
    msg = (
        'App name mismatch detected. The runner is configured with app name '
        '"checkout_bot", but the root agent was loaded from '
        '"/home/me/project/agents", which implies app name "agents".'
    )
    f = _SilenceFalsePositiveAppNameMismatch()
    assert f.filter(_make_record(msg)) is True


def test_passes_through_unrelated_warnings() -> None:
    """Filter must only target the specific mismatch warning."""
    f = _SilenceFalsePositiveAppNameMismatch()
    assert f.filter(_make_record("Something else entirely.")) is True
    assert f.filter(_make_record("Failed to call agent.")) is True


def test_install_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Installing twice must not stack duplicate filters on the
    target logger — engine reloads invoke initialize() again and we
    must not pile filters onto the module-level logger.
    """
    import idun_agent_engine.agent.adk.adk as adk_mod

    # Reset the module-level guard so this test exercises the install
    # path independent of any prior test/initialize() that may have
    # left it flipped.
    monkeypatch.setattr(adk_mod, "_app_name_mismatch_filter_installed", False)

    target = logging.getLogger("google_adk.google.adk.runners")
    before = list(target.filters)

    _install_app_name_mismatch_filter()
    _install_app_name_mismatch_filter()
    _install_app_name_mismatch_filter()

    new_filters = [f for f in target.filters if f not in before]
    assert len(new_filters) == 1, (
        f"expected exactly one new filter on idempotent re-install, got "
        f"{len(new_filters)}: {new_filters}"
    )
    assert isinstance(new_filters[0], _SilenceFalsePositiveAppNameMismatch)

    # Clean up so we don't leak the filter across other tests in the
    # same pytest process. ``target.filters`` is a plain list so
    # ``.remove(...)`` is fine.
    target.filters.remove(new_filters[0])


def test_filter_attached_to_runners_logger_silences_emit(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """End-to-end: an actual ``logger.warning`` on the runners logger
    with a false-positive message must not appear in captured logs
    after install."""
    import idun_agent_engine.agent.adk.adk as adk_mod

    monkeypatch.setattr(adk_mod, "_app_name_mismatch_filter_installed", False)
    target = logging.getLogger("google_adk.google.adk.runners")
    before = list(target.filters)

    _install_app_name_mismatch_filter()
    try:
        with caplog.at_level(logging.WARNING, logger=target.name):
            target.warning(
                'App name mismatch detected. The runner is configured '
                'with app name "x", but the root agent was loaded from '
                '"/x/.venv/lib/python3.12/site-packages/google/adk/agents", '
                'which implies app name "agents".'
            )
            target.warning("A genuine unrelated warning.")

        msgs = [r.getMessage() for r in caplog.records]
        assert not any(m.startswith("App name mismatch detected") for m in msgs)
        assert any("A genuine unrelated warning." in m for m in msgs)
    finally:
        installed = [f for f in target.filters if f not in before]
        for f in installed:
            target.filters.remove(f)
