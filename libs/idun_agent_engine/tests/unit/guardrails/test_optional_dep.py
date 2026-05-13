"""Tests for the optional ``guardrails-ai`` install path.

The dependency lives in the ``guardrails`` optional extra of
``idun-agent-engine``. Importing the engine — and any of its guardrails
submodules — must succeed regardless of whether the extra is installed.
Only the point of use must raise, and the error must point operators at
the install command — without masking transitive import failures inside
an installed guardrails-ai package.
"""

from __future__ import annotations

import builtins
import importlib
import subprocess
import sys

import pytest

_MODULE = "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub"


def _reload_module() -> object:
    """Re-import the hub module under the current ``sys.modules`` patches."""
    sys.modules.pop(_MODULE, None)
    sys.modules.pop("idun_agent_engine.guardrails.guardrails_hub", None)
    return importlib.import_module(_MODULE)


def _patch_import(monkeypatch, raises: BaseException) -> None:
    """Make ``import guardrails`` raise ``raises``; pass others through.

    Mirrors the real "module not installed" failure mode: a true
    ``ModuleNotFoundError`` with ``name`` set, raised by the import
    system itself. ``sys.modules[name] = None`` produces a generic
    ``ImportError`` without ``.name`` and would not exercise the
    narrowed catch in ``_require_guardrails_ai``.
    """
    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "guardrails" or name.startswith("guardrails."):
            raise raises
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    # Drop any cached entry so the hook actually runs on next import.
    for cached in [m for m in list(sys.modules) if m.startswith("guardrails")]:
        monkeypatch.delitem(sys.modules, cached, raising=False)


@pytest.mark.unit
def test_hub_module_imports_without_guardrails_ai(monkeypatch):
    """The hub module must load even when ``guardrails`` is unavailable.

    Operators who never configure guardrails should be able to install
    the base engine wheel and import any submodule. The class symbol
    must still exist after the reload — the absence of the optional
    dependency only matters at construction time.
    """
    _patch_import(
        monkeypatch,
        ModuleNotFoundError("No module named 'guardrails'", name="guardrails"),
    )

    module = _reload_module()

    assert hasattr(module, "GuardrailsHubGuard")
    assert hasattr(module, "_require_guardrails_ai")


@pytest.mark.unit
def test_require_guardrails_ai_raises_clear_error(monkeypatch):
    """``_require_guardrails_ai`` must point at the optional extra.

    A bare ``ModuleNotFoundError`` from a deep internal import leaves
    operators guessing. The wrapper converts it into an actionable
    install hint when the top-level ``guardrails`` package is missing.
    """
    _patch_import(
        monkeypatch,
        ModuleNotFoundError("No module named 'guardrails'", name="guardrails"),
    )

    module = _reload_module()

    with pytest.raises(ImportError, match=r"idun-agent-engine\[guardrails\]"):
        module._require_guardrails_ai()


@pytest.mark.unit
def test_require_guardrails_ai_does_not_mask_transitive_failure(monkeypatch):
    """Transitive import failures inside guardrails must bubble up.

    If ``guardrails-ai`` is installed but a sub-dep import breaks, the
    operator needs the real traceback — rewriting it to "install the
    extra" would send them on a wild goose chase. Only the case where
    the missing module is exactly ``guardrails`` may be wrapped.
    """
    _patch_import(
        monkeypatch,
        ModuleNotFoundError(
            "No module named 'guardrails.internal_dep'",
            name="guardrails.internal_dep",
        ),
    )

    module = _reload_module()

    with pytest.raises(ModuleNotFoundError) as excinfo:
        module._require_guardrails_ai()

    assert excinfo.value.name == "guardrails.internal_dep"
    # The friendly install hint must not appear — that would imply we
    # told the operator to reinstall when the real problem lives
    # elsewhere in the dependency graph.
    assert "idun-agent-engine[guardrails]" not in str(excinfo.value)


@pytest.mark.unit
def test_engine_package_does_not_import_guardrails_ai():
    """Importing ``idun_agent_engine`` must not pull in ``guardrails-ai``.

    The top-level package public API (``create_app``, ``run_server``,
    ``ConfigBuilder``, ``BaseAgent``, ``get_prompt``) is reachable
    without touching the guardrails hub. Regressing this would mean
    every consumer of the engine wheel transitively depends on the
    optional extra, defeating the split.

    Run in a subprocess so the cold-import assertion does not mutate
    the parent pytest session's ``sys.modules``. The previous in-process
    version called ``del sys.modules[...]`` plus ``importlib.import_module``
    without restoring state, leaking new module instances that every
    subsequent test's ``unittest.mock.patch`` then targeted while the
    test bodies still held references to the original instances —
    causing ~42 unrelated MCP and integration tests to fail silently.
    """
    proc = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; import idun_agent_engine; "
            "sys.exit(0 if 'guardrails' not in sys.modules else 1)",
        ],
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 0, (
        "Importing idun_agent_engine transitively imported the optional "
        "guardrails-ai package. Move the offending import behind a "
        "TYPE_CHECKING guard or push it into the function that uses it.\n"
        f"stderr: {proc.stderr.decode(errors='replace')}"
    )
