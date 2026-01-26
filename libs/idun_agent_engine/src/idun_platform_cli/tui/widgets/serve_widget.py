"""Serve configuration widget."""

from typing import Any

from rich.syntax import Syntax
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widget import Widget
from textual.widgets import Button, RichLog, Static


class ServeWidget(Widget):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.config_data = {}
        self.server_running = False
        self.shell_id = None

    def compose(self) -> ComposeResult:
        yaml_container = Vertical(classes="serve-yaml-display")
        yaml_container.border_title = "Agent Configuration"

        with yaml_container:
            yield Static("Loading configuration...", id="yaml_content")

        button_container = Horizontal(classes="serve-button-container")
        with button_container:
            yield Button(
                "Save and Exit", id="save_exit_button", classes="validate-run-btn"
            )
            yield Button(
                "Save and Run", id="save_run_button", classes="validate-run-btn"
            )

        logs_container = Vertical(classes="serve-logs", id="logs_container")
        logs_container.border_title = "Server Logs"
        logs_container.display = False
        with logs_container:
            yield RichLog(id="server_logs", highlight=True, markup=True)

    def load_config(self, config: dict) -> None:
        self.config_data = config
        self._update_yaml_display()

    def _update_yaml_display(self) -> None:
        import yaml

        if not self.config_data:
            self.query_one("#yaml_content", Static).update(
                "[yellow]No configuration loaded yet.[/yellow]\n"
                "[dim]Complete the previous sections to generate configuration.[/dim]"
            )
            return

        try:
            yaml_string = yaml.dump(
                self.config_data,
                default_flow_style=False,
                sort_keys=False,
                allow_unicode=True,
            )

            syntax = Syntax(
                yaml_string,
                "yaml",
                theme="monokai",
                line_numbers=True,
                word_wrap=False,
                indent_guides=True,
                background_color="default",
            )

            self.query_one("#yaml_content", Static).update(syntax)

        except Exception as e:
            error_msg = f"[red]Error displaying configuration:[/red]\n{str(e)}"
            self.query_one("#yaml_content", Static).update(error_msg)

    def get_agent_name(self) -> str:
        agent_info = self.config_data.get("agent", {})
        agent_config = agent_info.get("config", {})
        return agent_config.get("name", "")
