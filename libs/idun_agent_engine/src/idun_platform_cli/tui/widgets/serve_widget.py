"""Serve configuration widget."""

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widget import Widget
from textual.widgets import Button, RichLog, Static


class ServeWidget(Widget):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.config_data = {}
        self.server_running = False
        self.shell_id = None

    def compose(self) -> ComposeResult:
        summary_container = Vertical(classes="serve-summary")
        summary_container.border_title = "Configuration Summary"

        with summary_container:
            agent_box = Vertical(classes="summary-box", id="agent_summary")
            agent_box.border_title = "Agent"
            with agent_box:
                yield Static("Loading...", id="agent_summary_text")

            obs_box = Vertical(classes="summary-box", id="obs_summary")
            obs_box.border_title = "Observability"
            with obs_box:
                yield Static("Loading...", id="obs_summary_text")

        yield Button(
            "Validate & Run", id="validate_run_button", classes="validate-run-btn"
        )

        logs_container = Vertical(classes="serve-logs", id="logs_container")
        logs_container.border_title = "Server Logs"
        logs_container.display = False
        with logs_container:
            yield RichLog(id="server_logs", highlight=True, markup=True)

    def load_config(self, config: dict) -> None:
        self.config_data = config
        self._update_summary()

    def _update_summary(self) -> None:
        from idun_platform_cli.tui.schemas.create_agent import AGENT_SOURCE_KEY_MAPPING

        agent_info = self.config_data.get("agent", {})
        agent_config = agent_info.get("config", {})
        agent_type = agent_info.get("type")
        agent_name = agent_config.get("name")

        server_info = self.config_data.get("server", {})
        port = server_info.get("api", {}).get("port")

        graph_def_key = AGENT_SOURCE_KEY_MAPPING.get(agent_type, "graph_definition")
        graph_def = agent_config.get(graph_def_key)

        agent_text = f"Name: {agent_name}\nFramework: {agent_type}\nPort: {port}\nGraph: {graph_def}"

        self.query_one("#agent_summary_text", Static).update(agent_text)

        obs_list = self.config_data.get("observability", [])
        if obs_list:
            obs_data = obs_list[0]
            provider = obs_data.get("provider")
            enabled = obs_data.get("enabled", False)
            status = "Enabled" if enabled else "Disabled"
            obs_text = f"Provider: {provider}\nStatus: {status}"
        else:
            obs_text = "Not configured"

        self.query_one("#obs_summary_text", Static).update(obs_text)

    def get_agent_name(self) -> str:
        agent_info = self.config_data.get("agent", {})
        agent_config = agent_info.get("config", {})
        return agent_config.get("name", "")
