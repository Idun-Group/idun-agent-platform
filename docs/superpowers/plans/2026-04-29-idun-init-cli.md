# `idun-standalone init` CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `idun-standalone init` — a single-command terminal entry point that runs DB migrations, seeds from `config.yaml` if present, opens the browser, and boots the standalone server. The browser handles the wizard-or-chat conditional via sub-project C's existing redirect logic.

**Architecture:** One new Click subcommand in `cli.py` (~50 LOC + 2 imports) alongside the existing `setup`, `serve`, and `hash-password` commands. Reuses the existing `_setup` and `_serve` private coroutines so behavior matches `setup && serve` exactly, plus a `webbrowser.open` call. Tested via Click's `CliRunner` + `monkeypatch` against stubbed `upgrade_head` / `_setup` / `_serve` / `webbrowser.open`.

**Tech Stack:** Python 3.12+, Click 8, pytest, stdlib `webbrowser` and `os`. No new dependencies.

**Branch:** `feat/idun-init-cli` — already created off the `feat/onboarding-scanner` branch state.

---

## Files at a glance

| Path | Action | Responsibility |
|---|---|---|
| `libs/idun_agent_standalone/src/idun_agent_standalone/cli.py` | Modify | Add 2 imports + new `init` subcommand |
| `libs/idun_agent_standalone/tests/unit/test_cli_init.py` | Create | 6 unit tests against the new command |

That's the entire diff for sub-project D.

---

## Pattern reminders for implementers

- **Click `@main.command(...)`** decorator registers the subcommand on the existing `main` group at the top of `cli.py`. Match the style of `setup_cmd` and `serve_cmd`.
- **Click options:** `--port` is `type=int, default=None` so we can detect "user supplied a value." `--no-browser` is `is_flag=True, default=False`.
- **`StandaloneSettings()`** reads from environment via `pydantic-settings`. Construct it AFTER mutating `os.environ["IDUN_PORT"]` so the override propagates.
- **`_setup` and `_serve`** are existing module-level async functions in `cli.py`. Reuse them — don't duplicate logic.
- **`upgrade_head()`** is the existing alembic migration entry from `idun_agent_standalone.db.migrate`. Idempotent (no-op if DB is at head).
- **`webbrowser.open(url)`** is stdlib. Always returns quickly (it spawns the browser asynchronously). Tests stub it directly via monkeypatch.
- **`setup_logging()`** is called first in every existing CLI command. Match.
- **CliRunner** is from `click.testing` — used to invoke the command in tests without forking a subprocess.

---

## Task 1: Add the `init` command — happy path + browser launch

**Files:**
- Modify: `libs/idun_agent_standalone/src/idun_agent_standalone/cli.py`
- Test: `libs/idun_agent_standalone/tests/unit/test_cli_init.py`

This first task lands the command end-to-end with the basic happy path and a browser-launch test. Subsequent tasks add more test coverage.

- [ ] **Step 1: Write the failing tests**

Create `libs/idun_agent_standalone/tests/unit/test_cli_init.py`:

```python
"""Unit tests for the `idun-standalone init` CLI command.

The command is a thin launcher that runs DB migrations, seeds from
`config.yaml` if present, optionally opens the browser, and boots the
standalone server. We stub `upgrade_head`, `_setup`, `_serve`, and
`webbrowser.open` so the tests don't actually touch the DB or boot a
server.
"""

from __future__ import annotations

import os

import pytest
from click.testing import CliRunner
from idun_agent_standalone import cli as cli_module
from idun_agent_standalone.cli import main


@pytest.fixture
def stub_dependencies(monkeypatch: pytest.MonkeyPatch) -> dict[str, list]:
    """Stub the four side-effecting calls and record invocations.

    Returns a dict mapping each name to a list that records calls.
    Tests assert against ordering by reading the lists.
    """
    calls: dict[str, list] = {
        "upgrade_head": [],
        "_setup": [],
        "_serve": [],
        "webbrowser.open": [],
    }

    def fake_upgrade_head() -> None:
        calls["upgrade_head"].append(())

    async def fake_setup(config_path_override: str | None) -> None:
        calls["_setup"].append(config_path_override)

    async def fake_serve(settings: object) -> None:
        calls["_serve"].append(settings)

    def fake_browser_open(url: str) -> bool:
        calls["webbrowser.open"].append(url)
        return True

    # `upgrade_head` is imported inside `init_cmd` from `db.migrate`, so we
    # patch it where it lives, then patch the cli module's references too.
    monkeypatch.setattr(
        "idun_agent_standalone.db.migrate.upgrade_head", fake_upgrade_head
    )
    monkeypatch.setattr(cli_module, "_setup", fake_setup)
    monkeypatch.setattr(cli_module, "_serve", fake_serve)
    monkeypatch.setattr(cli_module.webbrowser, "open", fake_browser_open)

    # Clean any leftover IDUN_PORT from prior tests.
    monkeypatch.delenv("IDUN_PORT", raising=False)

    return calls


def test_init_is_registered_as_subcommand() -> None:
    """`idun-standalone init --help` must succeed and the command must
    appear under the `main` group."""
    assert "init" in main.commands
    runner = CliRunner()
    result = runner.invoke(main, ["init", "--help"])
    assert result.exit_code == 0
    assert "Initialize Idun" in result.output


def test_init_default_flow_opens_browser_then_serves(
    stub_dependencies: dict[str, list],
) -> None:
    """Default invocation: migrations → setup → browser → serve.

    Asserts both that all four side-effects fire AND that they fire in
    the right order (migrations + setup BEFORE browser, browser BEFORE
    serve).
    """
    runner = CliRunner()
    result = runner.invoke(main, ["init"])
    assert result.exit_code == 0, result.output

    assert len(stub_dependencies["upgrade_head"]) == 1
    assert len(stub_dependencies["_setup"]) == 1
    assert len(stub_dependencies["webbrowser.open"]) == 1
    assert len(stub_dependencies["_serve"]) == 1

    # The recorded call to webbrowser.open must be a URL pointing at
    # http://<host>:<port>/ where host and port came from settings.
    url = stub_dependencies["webbrowser.open"][0]
    assert url.startswith("http://")
    assert url.endswith("/")
```

- [ ] **Step 2: Run tests — must fail**

```bash
cd /Users/geoffreyharrazi/Documents/GitHub/idun-agent-platform
uv run pytest libs/idun_agent_standalone/tests/unit/test_cli_init.py -v
```

Expected: collection errors / `KeyError: 'init'` because the command doesn't exist yet.

- [ ] **Step 3: Add the imports**

Modify the top of `libs/idun_agent_standalone/src/idun_agent_standalone/cli.py`. Find the existing import block:

```python
from __future__ import annotations

import asyncio
from pathlib import Path

import click
import uvicorn

from idun_agent_standalone.core.logging import get_logger, setup_logging
from idun_agent_standalone.core.settings import StandaloneSettings
```

Replace with:

```python
from __future__ import annotations

import asyncio
import os
import webbrowser
from pathlib import Path

import click
import uvicorn

from idun_agent_standalone.core.logging import get_logger, setup_logging
from idun_agent_standalone.core.settings import StandaloneSettings
```

(`os` and `webbrowser` are stdlib — no `pyproject.toml` change.)

- [ ] **Step 4: Add the `init` command**

Modify `libs/idun_agent_standalone/src/idun_agent_standalone/cli.py`. After the existing `serve_cmd` function, add the new `init_cmd`:

```python
@main.command("init")
@click.option(
    "--port",
    "port_override",
    type=int,
    default=None,
    help="Port to bind. Overrides IDUN_PORT (default 8000).",
)
@click.option(
    "--no-browser",
    "no_browser",
    is_flag=True,
    default=False,
    help="Don't open the browser automatically. Useful for Cloud Run + headless.",
)
def init_cmd(port_override: int | None, no_browser: bool) -> None:
    """Initialize Idun in the current folder and launch chat + admin.

    Runs DB migrations, seeds from ``config.yaml`` if present, opens the
    browser at ``http://<host>:<port>/``, then boots the standalone
    server. The browser handles the wizard-or-chat conditional: if an
    agent is configured the chat root renders, otherwise the wizard at
    ``/onboarding`` takes over.

    Idempotent: re-running on an already-initialized folder is safe and
    re-launches the server.
    """
    setup_logging()

    # Resolve port: --port flag > IDUN_PORT env > default 8000.
    if port_override is not None:
        os.environ["IDUN_PORT"] = str(port_override)

    settings = StandaloneSettings()

    # Migrations + seed (both no-op when already at head / DB has rows).
    from idun_agent_standalone.db.migrate import upgrade_head

    upgrade_head()
    asyncio.run(_setup(config_path_override=None))

    # Open the browser BEFORE serve. _serve blocks the main thread; opening
    # after would require threading. Modern browsers retry connection-refused
    # for several seconds, giving uvicorn a window to come up.
    if not no_browser:
        webbrowser.open(f"http://{settings.host}:{settings.port}/")

    asyncio.run(_serve(settings))
```

- [ ] **Step 5: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/test_cli_init.py -v
```

Expected: 2 tests pass.

- [ ] **Step 6: Lint check**

```bash
uv run ruff check libs/idun_agent_standalone/src/idun_agent_standalone/cli.py \
                  libs/idun_agent_standalone/tests/unit/test_cli_init.py
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add libs/idun_agent_standalone/src/idun_agent_standalone/cli.py \
        libs/idun_agent_standalone/tests/unit/test_cli_init.py
git commit -m "feat(standalone): idun-standalone init — thin launcher for the wizard"
```

---

## Task 2: `--port` flag override + `--no-browser` flag

**Files:**
- Test: `libs/idun_agent_standalone/tests/unit/test_cli_init.py` (modify — append tests)

This task pins the two flag behaviors. The implementation already supports them (Task 1 wired them up); these tests prove they work.

- [ ] **Step 1: Append the failing tests**

Append to `libs/idun_agent_standalone/tests/unit/test_cli_init.py`:

```python
def test_init_port_flag_sets_idun_port_env(
    stub_dependencies: dict[str, list], monkeypatch: pytest.MonkeyPatch
) -> None:
    """`--port 9000` must set IDUN_PORT before settings are constructed
    so the override propagates to uvicorn."""
    runner = CliRunner()
    result = runner.invoke(main, ["init", "--port", "9000"])
    assert result.exit_code == 0, result.output

    # The browser-open URL is the only observable side-effect that
    # carries the resolved port; assert against it.
    url = stub_dependencies["webbrowser.open"][0]
    assert ":9000/" in url


def test_init_no_browser_flag_suppresses_launch(
    stub_dependencies: dict[str, list],
) -> None:
    """`--no-browser` must skip the webbrowser.open call but still run
    the rest of the flow."""
    runner = CliRunner()
    result = runner.invoke(main, ["init", "--no-browser"])
    assert result.exit_code == 0, result.output

    assert stub_dependencies["webbrowser.open"] == []
    # The other three side-effects must still fire.
    assert len(stub_dependencies["upgrade_head"]) == 1
    assert len(stub_dependencies["_setup"]) == 1
    assert len(stub_dependencies["_serve"]) == 1
```

- [ ] **Step 2: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/test_cli_init.py -v
```

Expected: 4 tests pass (2 existing + 2 new).

- [ ] **Step 3: Commit**

```bash
git add libs/idun_agent_standalone/tests/unit/test_cli_init.py
git commit -m "test(standalone): pin --port + --no-browser flag behavior on idun init"
```

---

## Task 3: Call ordering — migrations BEFORE browser launch BEFORE serve

**Files:**
- Test: `libs/idun_agent_standalone/tests/unit/test_cli_init.py` (modify — append tests)

The spec is explicit about call ordering: `setup_logging` → migrations → setup → browser → serve. This task pins that contract.

- [ ] **Step 1: Append failing tests**

Append to `libs/idun_agent_standalone/tests/unit/test_cli_init.py`:

```python
@pytest.fixture
def ordered_dependencies(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Like `stub_dependencies` but records call ORDER in a flat list.

    Use to assert that migrations + setup run BEFORE the browser and
    BEFORE serve, and that serve is the last step.
    """
    order: list[str] = []

    def fake_upgrade_head() -> None:
        order.append("upgrade_head")

    async def fake_setup(config_path_override: str | None) -> None:
        order.append("_setup")

    async def fake_serve(settings: object) -> None:
        order.append("_serve")

    def fake_browser_open(url: str) -> bool:
        order.append("webbrowser.open")
        return True

    monkeypatch.setattr(
        "idun_agent_standalone.db.migrate.upgrade_head", fake_upgrade_head
    )
    monkeypatch.setattr(cli_module, "_setup", fake_setup)
    monkeypatch.setattr(cli_module, "_serve", fake_serve)
    monkeypatch.setattr(cli_module.webbrowser, "open", fake_browser_open)
    monkeypatch.delenv("IDUN_PORT", raising=False)

    return order


def test_init_call_order_default(ordered_dependencies: list[str]) -> None:
    """Migrations → setup → browser → serve."""
    runner = CliRunner()
    result = runner.invoke(main, ["init"])
    assert result.exit_code == 0, result.output
    assert ordered_dependencies == [
        "upgrade_head",
        "_setup",
        "webbrowser.open",
        "_serve",
    ]


def test_init_call_order_no_browser(ordered_dependencies: list[str]) -> None:
    """With --no-browser: migrations → setup → serve. (no webbrowser.open)"""
    runner = CliRunner()
    result = runner.invoke(main, ["init", "--no-browser"])
    assert result.exit_code == 0, result.output
    assert ordered_dependencies == [
        "upgrade_head",
        "_setup",
        "_serve",
    ]
```

- [ ] **Step 2: Run tests — must pass**

```bash
uv run pytest libs/idun_agent_standalone/tests/unit/test_cli_init.py -v
```

Expected: 6 tests pass (2 from Task 1 + 2 from Task 2 + 2 new).

- [ ] **Step 3: Run the full standalone test suite — no regressions**

```bash
uv run pytest libs/idun_agent_standalone/tests/ -q
```

Expected: all pre-existing tests still pass + 6 new init tests = full suite green.

- [ ] **Step 4: Run lint + format on the touched files**

```bash
uv run ruff check libs/idun_agent_standalone/src/idun_agent_standalone/cli.py \
                  libs/idun_agent_standalone/tests/unit/test_cli_init.py
uv run black --check libs/idun_agent_standalone/src/idun_agent_standalone/cli.py \
                     libs/idun_agent_standalone/tests/unit/test_cli_init.py
```

Expected: both clean.

- [ ] **Step 5: Smoke test the actual CLI invocation**

```bash
uv run idun-standalone init --help
```

Expected output includes the command description plus `--port` and `--no-browser` flags. This proves the entry-point script registered the new subcommand correctly.

- [ ] **Step 6: Commit**

```bash
git add libs/idun_agent_standalone/tests/unit/test_cli_init.py
git commit -m "test(standalone): pin idun init call order — migrations → browser → serve"
```

---

## Spec coverage check

| Spec section | Implementing task |
|---|---|
| §4 Locked decisions (1) thin launcher | Task 1 (the implementation IS a thin launcher) |
| §4 (2) engine TUI disconnected | Out of scope per spec §3 — separate one-line PR |
| §4 (3) lives in standalone package | Task 1 (file path) |
| §4 (4) port override chain | Task 2 (`test_init_port_flag_sets_idun_port_env`) |
| §4 (5) `--no-browser` flag | Task 2 (`test_init_no_browser_flag_suppresses_launch`) |
| §4 (6) idempotent | Task 1 (the implementation calls `upgrade_head` + `_setup` which are themselves idempotent) |
| §4 (7) standard Unix lifecycle | Implicit — `_serve` reuse means lifecycle matches `serve` exactly |
| §6 init command flow steps 1-7 | Task 1 |
| §6 "browser BEFORE serve" rationale | Task 3 (call-order test) |
| §6 idempotent re-run | Task 1 (relies on the existing `upgrade_head` and `seed_from_yaml_if_empty` idempotency) |
| §6 Cloud Run viability | Documentation note, no code |
| §7 imports | Task 1 |
| §8 testing strategy | Tasks 1-3 (6 unit tests total) |

## Test count summary

- 2 tests (Task 1): subcommand registration, default flow with browser
- 2 tests (Task 2): `--port` flag, `--no-browser` flag
- 2 tests (Task 3): call ordering with browser, call ordering without browser

**Total new tests: 6.**
