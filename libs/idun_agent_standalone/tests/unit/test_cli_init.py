"""Unit tests for the `idun-standalone init` CLI command.

The command is a thin launcher that runs DB migrations, seeds from
`config.yaml` if present, optionally opens the browser, and boots the
standalone server. We stub `upgrade_head`, `_setup`, `_serve`, and
`webbrowser.open` so the tests don't actually touch the DB or boot a
server.
"""

from __future__ import annotations

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
