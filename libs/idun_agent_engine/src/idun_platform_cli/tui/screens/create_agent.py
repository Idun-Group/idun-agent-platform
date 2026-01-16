from pathlib import Path

from idun_agent_schema.engine.guardrails_v2 import GuardrailsV2
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from pydantic import ValidationError
from textual.app import ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.reactive import reactive
from textual.screen import Screen
from textual.widgets import Button, Footer, Label, RichLog

from idun_platform_cli.tui.css.create_agent import CREATE_AGENT_CSS
from idun_platform_cli.tui.schemas.create_agent import TUIAgentConfig
from idun_platform_cli.tui.utils.config import ConfigManager
from idun_platform_cli.tui.widgets import (
    GuardrailsWidget,
    IdentityWidget,
    MCPsWidget,
    ObservabilityWidget,
    ServeWidget,
)


class CreateAgentScreen(Screen):
    CSS = CREATE_AGENT_CSS
    BINDINGS = [
        ("tab", "toggle_focus_area", "Switch Area / Next Field"),
        ("up", "nav_up", "Navigate Panes"),
        ("down", "nav_down", ""),
    ]

    active_section = reactive("identity")
    nav_panes = [
        "nav-identity",
        "nav-observability",
        "nav-guardrails",
        "nav-mcps",
        "nav-serve",
    ]
    current_nav_index = 0
    focus_on_nav = True  # Track if focus is on nav or content

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.widgets_map = {}
        self.config_manager = ConfigManager()
        self.validated_sections = set()
        self.server_process = None
        self.server_running = False

    def watch_active_section(self, new_section: str) -> None:
        for section_id, widget in self.widgets_map.items():
            if section_id == new_section:
                widget.display = True
            else:
                widget.display = False

        if new_section == "serve":
            config = self.config_manager.load_config()
            serve_widget = self.widgets_map.get("serve")
            if serve_widget:
                if config:
                    serve_widget.load_config(config)
                else:
                    self.notify(
                        "Debug: Config is empty, agent_path might not be set",
                        severity="warning",
                    )

        for pane_id in [
            "nav-identity",
            "nav-observability",
            "nav-guardrails",
            "nav-mcps",
            "nav-serve",
        ]:
            pane = self.query_one(f"#{pane_id}")
            if pane_id == f"nav-{new_section}":
                pane.add_class("nav-pane-active")
            else:
                pane.remove_class("nav-pane-active")

    def compose(self) -> ComposeResult:
        app_container = Container(classes="app-container")
        app_container.border_title = "Creating a New Agent"

        with app_container:
            with Horizontal(classes="main-layout"):
                nav_container = Vertical(classes="nav-container")
                nav_container.border_title = "Sections"

                with nav_container:
                    nav_identity = Vertical(
                        Label(
                            "Configure agent\nname, framework,\nand port",
                            id="nav-identity-label",
                        ),
                        classes="nav-pane nav-pane-active",
                        id="nav-identity",
                    )
                    nav_identity.border_title = "Agent Information"
                    nav_identity.can_focus = True
                    yield nav_identity

                    nav_observability = Vertical(
                        Label(
                            "Setup monitoring\nand tracing",
                            id="nav-observability-label",
                        ),
                        classes="nav-pane",
                        id="nav-observability",
                    )
                    nav_observability.border_title = "Observability"
                    nav_observability.can_focus = True
                    yield nav_observability

                    nav_guardrails = Vertical(
                        Label("Define rules and\nvalidation"),
                        classes="nav-pane",
                        id="nav-guardrails",
                    )
                    nav_guardrails.border_title = "Guardrails"
                    nav_guardrails.can_focus = True
                    yield nav_guardrails

                    nav_mcps = Vertical(
                        Label("Add tools and\nresources"),
                        classes="nav-pane",
                        id="nav-mcps",
                    )
                    nav_mcps.border_title = "MCPs"
                    nav_mcps.can_focus = True
                    yield nav_mcps

                    nav_serve = Vertical(
                        Label("Review and start\nagent"),
                        classes="nav-pane",
                        id="nav-serve",
                    )
                    nav_serve.border_title = "Validate & Run"
                    nav_serve.can_focus = True
                    yield nav_serve

                    with Horizontal(classes="action-buttons"):
                        yield Button("Back", id="back_button", classes="action-btn")
                        yield Button("Next", id="next_button", classes="action-btn")

                with Vertical(classes="content-area"):
                    identity = IdentityWidget(id="widget-identity", classes="section")

                    observability = ObservabilityWidget(
                        id="widget-observability", classes="section"
                    )
                    observability.border_title = "Observability"

                    guardrails = GuardrailsWidget(
                        id="widget-guardrails", classes="section"
                    )
                    guardrails.border_title = "Guardrails"

                    mcps = MCPsWidget(id="widget-mcps", classes="section")
                    mcps.border_title = "MCPs"

                    serve = ServeWidget(id="widget-serve", classes="section")
                    serve.border_title = "Validate & Run"

                    self.widgets_map = {
                        "identity": identity,
                        "observability": observability,
                        "guardrails": guardrails,
                        "mcps": mcps,
                        "serve": serve,
                    }

                    observability.display = False
                    guardrails.display = False
                    mcps.display = False
                    serve.display = False

                    yield identity
                    yield observability
                    yield guardrails
                    yield mcps
                    yield serve

        yield Footer()

    def on_mount(self) -> None:
        nav_pane = self.query_one("#nav-identity")
        nav_pane.focus()

    def action_toggle_focus_area(self) -> None:
        focused = self.focused

        if (
            focused
            and hasattr(focused, "id")
            and focused.id
            and focused.id.startswith("nav-")
        ):
            self.focus_on_nav = False
            active_widget = self.widgets_map.get(self.active_section)
            if active_widget:
                try:
                    focusable = active_widget.query(
                        "Input, OptionList, DirectoryTree, Button"
                    ).first()
                    if focusable:
                        focusable.focus()
                    else:
                        active_widget.focus()
                except:
                    active_widget.focus()
        else:
            self.focus_next()

    def on_focus(self, event) -> None:
        focused_widget = event.widget
        nav_container = self.query_one(".nav-container")

        if focused_widget.id and focused_widget.id.startswith("nav-"):
            self.focus_on_nav = True
            nav_container.add_class("nav-container-active")
        else:
            nav_container.remove_class("nav-container-active")
            if focused_widget.id in [
                "name_input",
                "framework_select",
                "port_input",
                "file_tree",
                "variable_list",
            ]:
                self.focus_on_nav = False

    def action_nav_up(self) -> None:
        focused = self.focused
        if (
            focused
            and hasattr(focused, "id")
            and focused.id
            and focused.id.startswith("nav-")
        ):
            self.current_nav_index = (self.current_nav_index - 1) % len(self.nav_panes)
            nav_pane = self.query_one(f"#{self.nav_panes[self.current_nav_index]}")
            nav_pane.focus()
            section = self.nav_panes[self.current_nav_index].replace("nav-", "")
            self.active_section = section

    def action_nav_down(self) -> None:
        focused = self.focused
        if (
            focused
            and hasattr(focused, "id")
            and focused.id
            and focused.id.startswith("nav-")
        ):
            self.current_nav_index = (self.current_nav_index + 1) % len(self.nav_panes)
            nav_pane = self.query_one(f"#{self.nav_panes[self.current_nav_index]}")
            nav_pane.focus()
            section = self.nav_panes[self.current_nav_index].replace("nav-", "")
            self.active_section = section

    def on_click(self, event) -> None:
        target = event.widget
        for node in [target] + list(target.ancestors):
            if node.id and node.id.startswith("nav-"):
                section = node.id.replace("nav-", "")
                self.active_section = section
                self.focus_on_nav = True

                nav_id = f"nav-{section}"
                if nav_id in self.nav_panes:
                    self.current_nav_index = self.nav_panes.index(nav_id)
                break

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back_button":
            current_index = self.current_nav_index
            if current_index > 0:
                self.current_nav_index = current_index - 1
                nav_pane = self.query_one(f"#{self.nav_panes[self.current_nav_index]}")
                nav_pane.focus()
                section = self.nav_panes[self.current_nav_index].replace("nav-", "")
                self.active_section = section
        elif event.button.id == "next_button":
            section = self.nav_panes[self.current_nav_index].replace("nav-", "")
            widget = self.widgets_map.get(section)

            if not widget:
                return

            if section == "identity":
                data = widget.get_data()
                if data is None:
                    self.notify("Please complete all required fields", severity="error")
                    return
                try:
                    _ = TUIAgentConfig.model_validate(data)
                    agent_name = data.get("name")
                    success, msg = self.config_manager.save_partial(
                        "identity", data, agent_name=agent_name
                    )
                    if not success:
                        self.notify(
                            f"Save failed: {msg}",
                            severity="error",
                        )
                        return
                    self.validated_sections.add("identity")
                    self._update_nav_checkmark("identity")
                except ValidationError as e:
                    self.notify(
                        f"Validation error: {str(e)}",
                        severity="error",
                    )
                    return

            elif section == "observability":
                data = widget.get_data()
                if data is None:
                    self.validated_sections.add("observability")
                    self._update_nav_checkmark("observability")
                elif isinstance(data, ObservabilityConfig):
                    success, _ = self.config_manager.save_partial("observability", data)
                    if not success:
                        self.notify(
                            "Observability configuration is invalid", severity="error"
                        )
                        return
                    self.validated_sections.add("observability")
                    self._update_nav_checkmark("observability")
                else:
                    self.notify(
                        "Observability configuration is invalid", severity="error"
                    )
                    return

            elif section == "guardrails":
                data = widget.get_data()
                if data and isinstance(data, GuardrailsV2):
                    success, msg = self.config_manager.save_partial("guardrails", data)
                    if not success:
                        self.notify(
                            "Guardrails configuration is invalid", severity="error"
                        )
                        return
                    self.validated_sections.add("guardrails")
                    self._update_nav_checkmark("guardrails")

            elif section == "mcps":
                self.validated_sections.add(section)
                self._update_nav_checkmark(section)

            current_index = self.current_nav_index
            if current_index < len(self.nav_panes) - 1:
                self.current_nav_index = current_index + 1
                nav_pane = self.query_one(f"#{self.nav_panes[self.current_nav_index]}")
                nav_pane.focus()
                section = self.nav_panes[self.current_nav_index].replace("nav-", "")
                self.active_section = section

        elif event.button.id == "validate_run_button":
            if self.server_running and self.server_process:
                self.server_process.terminate()
                self.server_process = None
                self.server_running = False

                button = self.query_one("#validate_run_button", Button)
                button.label = "Validate & Run"
                button.remove_class("kill-mode")

                rich_log = self.query_one("#server_logs", RichLog)
                rich_log.write("\n[red]Server stopped[/red]")

                self.notify("Server stopped", severity="information")
                return

            serve_widget = self.widgets_map.get("serve")
            if not serve_widget:
                return

            agent_name = serve_widget.get_agent_name()
            if not agent_name:
                self.notify("No agent configuration found", severity="error")
                return

            sanitized_name = self.config_manager._sanitize_agent_name(agent_name)
            config_path = Path.home() / ".idun" / f"{sanitized_name}.yaml"

            if not config_path.exists():
                self.notify("Configuration file not found", severity="error")
                return

            logs_container = self.query_one("#logs_container")
            logs_container.display = True

            rich_log = self.query_one("#server_logs", RichLog)
            rich_log.clear()
            rich_log.write(f"Starting server for agent: {agent_name}")
            rich_log.write(f"Config: {config_path}")

            command = f"idun agent serve --source=file --path={config_path}"

            import subprocess
            import os
            import fcntl

            try:
                process = subprocess.Popen(
                    command,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )

                fd = process.stdout.fileno()
                fl = fcntl.fcntl(fd, fcntl.F_GETFL)
                fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

                self.server_process = process
                self.server_running = True

                button = self.query_one("#validate_run_button", Button)
                button.label = "Kill Server"
                button.add_class("kill-mode")

                self.run_worker(self._stream_logs(process), exclusive=True)

            except Exception as e:
                self.notify(f"Failed to start server: {e}", severity="error")

    async def _stream_logs(self, process) -> None:
        import asyncio

        rich_log = self.query_one("#server_logs", RichLog)

        while self.server_running:
            try:
                line = process.stdout.readline()
                if line:
                    rich_log.write(line.strip())
            except:
                pass

            if process.poll() is not None:
                remaining = process.stdout.read()
                if remaining:
                    for line in remaining.split("\n"):
                        if line.strip():
                            rich_log.write(line.strip())

                self.server_running = False
                self.server_process = None
                button = self.query_one("#validate_run_button", Button)
                button.label = "Validate & Run"
                button.remove_class("kill-mode")
                rich_log.write("\n[yellow]Server exited[/yellow]")
                break

            await asyncio.sleep(0.1)

    def _update_nav_checkmark(self, section: str) -> None:
        nav_pane = self.query_one(f"#nav-{section}")
        nav_pane.add_class("nav-pane-validated")
