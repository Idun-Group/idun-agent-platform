from enum import StrEnum
from typing import Any

from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, VerticalScroll
from textual.widget import Widget
from textual.widgets import Button, Footer, Link, Static

from idun_agent_engine._version import __version__
from idun_platform_cli.tui.css.main import CSS
from idun_platform_cli.tui.screens.create_agent import CreateAgentScreen
from idun_platform_cli.tui.utils.config import ConfigManager


class Actions(StrEnum):
    NEW_AGENT = "new_agent"
    UPDATE_AGENT = "update_agent"
    TOUR = "tour"
    EXIT = "exit"


class MainPageActions(Widget):
    CSS_PATH = "selection_list.tcss"

    def compose(self) -> ComposeResult:
        with VerticalScroll(classes="actions"):
            yield Button("✨ Configure a new Agent", id="new_agent")
            # yield Button("🔨 Modify an existing Agent", id="update_agent")
            # yield Button("🔍 Tour Idun Agent Platform", id="tour")
            yield Button("🚪 Exit", id="exit")

    def on_mount(self):
        self.query_one("#new_agent", Button).focus()


class IdunApp(App):
    CSS = CSS
    REPO = "https://github.com/idun-group/idun-agent-platform"
    DOCS = "https://idun-group.github.io/idun-agent-platform"

    BINDINGS = [
        ("up", "focus_previous", "Previous"),
        ("down", "focus_next", "Next"),
    ]

    config_manager = ConfigManager()
    config: dict[str, Any] = {}

    def compose(self):
        with Container():
            yield Static(
                """██╗██████╗ ██╗   ██╗███╗   ██╗
██║██╔══██╗██║   ██║████╗  ██║
██║██║  ██║██║   ██║██╔██╗ ██║
██║██║  ██║██║   ██║██║╚██╗██║
██║██████╔╝╚██████╔╝██║ ╚████║
╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝""",
                classes="ascii-logo",
            )

            yield Static("IDUN AGENT PLATFORM", classes="platform")
            yield Static("Deploy, guard and monitor any agent", classes="tagline")
            yield Static("LangGraph • ADK • Guardrails • Observability • MCP", classes="features-subtle")
            yield Static("Built with 💜 by Idun Group", classes="built-by")
            yield Static(f"v{__version__}", classes="version")
            with Horizontal(classes="link-container"):
                yield Link("⭐️ Github", url=self.REPO, classes="links")
                yield Link("📚 Docs", url=self.DOCS, classes="links")

            yield MainPageActions()
        yield Footer()

    def on_button_pressed(self, event: Button.Pressed):
        import sys

        button_id = event.button.id
        match button_id:
            case Actions.EXIT:
                sys.exit(0)

            case Actions.NEW_AGENT:
                self.push_screen(CreateAgentScreen())


if __name__ == "__main__":
    app = IdunApp()
    app.run()
