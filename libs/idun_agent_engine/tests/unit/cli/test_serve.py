"""Tests for the `idun agent serve` CLI wrapper."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner


@pytest.mark.unit
class TestServeUIDir:
    """--ui-dir threads the override through to create_app."""

    def test_serve_passes_ui_dir_override_to_create_app(self, tmp_path) -> None:
        """Serve(...ui_dir='X').serve() forwards ui_dir_override='X' to create_app."""
        from idun_platform_cli.groups.agent.serve import Serve, ServerSource

        cfg_path = tmp_path / "cfg.yaml"
        cfg_path.write_text(
            "server:\n"
            "  api:\n"
            "    port: 0\n"
            "agent:\n"
            "  type: LANGGRAPH\n"
            "  config:\n"
            "    name: test\n"
            "    graph_definition: ./nope.py:graph\n"
        )

        with (
            patch(
                "idun_platform_cli.groups.agent.serve.create_app"
            ) as mock_create_app,
            patch(
                "idun_platform_cli.groups.agent.serve.run_server"
            ) as mock_run_server,
        ):
            mock_create_app.return_value = MagicMock()

            server = Serve(
                source=ServerSource.FILE,
                path=str(cfg_path),
                ui_dir="/tmp/my-ui",
            )
            server.serve()

            mock_create_app.assert_called_once()
            _, kwargs = mock_create_app.call_args
            assert kwargs.get("ui_dir_override") == "/tmp/my-ui"
            mock_run_server.assert_called_once()

    def test_serve_without_ui_dir_passes_none(self, tmp_path) -> None:
        """No --ui-dir -> create_app called with ui_dir_override=None."""
        from idun_platform_cli.groups.agent.serve import Serve, ServerSource

        cfg_path = tmp_path / "cfg.yaml"
        cfg_path.write_text(
            "server:\n"
            "  api:\n"
            "    port: 0\n"
            "agent:\n"
            "  type: LANGGRAPH\n"
            "  config:\n"
            "    name: test\n"
            "    graph_definition: ./nope.py:graph\n"
        )

        with (
            patch(
                "idun_platform_cli.groups.agent.serve.create_app"
            ) as mock_create_app,
            patch("idun_platform_cli.groups.agent.serve.run_server"),
        ):
            mock_create_app.return_value = MagicMock()

            server = Serve(source=ServerSource.FILE, path=str(cfg_path))
            server.serve()

            _, kwargs = mock_create_app.call_args
            assert kwargs.get("ui_dir_override") is None

    def test_click_command_accepts_ui_dir_flag(self, tmp_path) -> None:
        """`idun agent serve --ui-dir PATH` parses and forwards the flag."""
        from idun_platform_cli.groups.agent.serve import serve_command

        cfg_path = tmp_path / "cfg.yaml"
        cfg_path.write_text(
            "server:\n"
            "  api:\n"
            "    port: 0\n"
            "agent:\n"
            "  type: LANGGRAPH\n"
            "  config:\n"
            "    name: test\n"
            "    graph_definition: ./nope.py:graph\n"
        )

        runner = CliRunner()
        with (
            patch(
                "idun_platform_cli.groups.agent.serve.create_app"
            ) as mock_create_app,
            patch("idun_platform_cli.groups.agent.serve.run_server"),
        ):
            mock_create_app.return_value = MagicMock()

            result = runner.invoke(
                serve_command,
                [
                    "--source",
                    "file",
                    "--path",
                    str(cfg_path),
                    "--ui-dir",
                    "/tmp/flag-ui",
                ],
            )

            assert result.exit_code == 0, result.output
            _, kwargs = mock_create_app.call_args
            assert kwargs.get("ui_dir_override") == "/tmp/flag-ui"
