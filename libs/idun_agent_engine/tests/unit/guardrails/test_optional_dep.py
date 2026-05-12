"""Tests for the optional ``guardrails-ai`` install path.

The dependency lives in the ``guardrails`` optional extra of
``idun-agent-engine``. Importing the engine — and any of its guardrails
submodules — must succeed regardless of whether the extra is installed.
Only the point of use must raise, and the error must point operators at
the install command.
"""

from __future__ import annotations

import importlib
import sys

import pytest

_MODULE = "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub"


def _reload_module() -> object:
    """Re-import the hub module under the current ``sys.modules`` patches."""
    sys.modules.pop(_MODULE, None)
    sys.modules.pop("idun_agent_engine.guardrails.guardrails_hub", None)
    return importlib.import_module(_MODULE)


@pytest.mark.unit
def test_hub_module_imports_without_guardrails_ai(monkeypatch):
    """The hub module must load even when ``guardrails`` is unavailable.

    Operators who never configure guardrails should be able to install
    the base engine wheel and import any submodule. The class symbol
    must still exist after the reload — the absence of the optional
    dependency only matters at construction time.
    """
    # Make ``import guardrails`` fail for the duration of this test.
    monkeypatch.setitem(sys.modules, "guardrails", None)

    module = _reload_module()

    assert hasattr(module, "GuardrailsHubGuard")
    assert hasattr(module, "_require_guardrails_ai")


@pytest.mark.unit
def test_require_guardrails_ai_raises_clear_error(monkeypatch):
    """``_require_guardrails_ai`` must point at the optional extra.

    A bare ``ModuleNotFoundError`` from a deep internal import leaves
    operators guessing. The wrapper converts it into an actionable
    install hint.
    """
    monkeypatch.setitem(sys.modules, "guardrails", None)

    module = _reload_module()

    with pytest.raises(ImportError, match=r"idun-agent-engine\[guardrails\]"):
        module._require_guardrails_ai()


@pytest.mark.unit
def test_engine_package_does_not_import_guardrails_ai():
    """Importing ``idun_agent_engine`` must not pull in ``guardrails-ai``.

    The top-level package public API (``create_app``, ``run_server``,
    ``ConfigBuilder``, ``BaseAgent``, ``get_prompt``) is reachable
    without touching the guardrails hub. Regressing this would mean
    every consumer of the engine wheel transitively depends on the
    optional extra, defeating the split.
    """
    # Clear the cached engine import so the assertion reflects a cold
    # import path rather than whatever fixtures already loaded.
    for name in list(sys.modules):
        if name == "idun_agent_engine" or name.startswith("idun_agent_engine."):
            del sys.modules[name]
    sys.modules.pop("guardrails", None)

    importlib.import_module("idun_agent_engine")

    assert "guardrails" not in sys.modules, (
        "Importing idun_agent_engine transitively imported the optional "
        "guardrails-ai package. Move the offending import behind a "
        "TYPE_CHECKING guard or push it into the function that uses it."
    )
