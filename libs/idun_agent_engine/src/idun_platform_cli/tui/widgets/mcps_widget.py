"""MCPs configuration widget."""

from textual.app import ComposeResult
from textual.widgets import Static
from textual.widget import Widget


class MCPsWidget(Widget):
    def compose(self) -> ComposeResult:
        yield Static("MCPs", classes="placeholder-title")
