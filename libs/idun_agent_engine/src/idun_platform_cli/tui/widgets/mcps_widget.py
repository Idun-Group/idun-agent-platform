"""MCPs configuration widget."""

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widget import Widget
from textual.widgets import (
    Button,
    Input,
    OptionList,
    RadioButton,
    RadioSet,
    Static,
    TextArea,
)
from textual.widgets.option_list import Option

MCP_TEMPLATES = {
    "time": {
        "name": "time-reference",
        "transport": "stdio",
        "command": "docker",
        "args": ["run", "-i", "--rm", "mcp/time"],
    },
}


class MCPsWidget(Widget):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.mcp_servers = []
        self.next_server_id = 0

    def on_mount(self) -> None:
        template_selector = self.query_one("#template_selector", OptionList)
        if template_selector.option_count > 0:
            template_selector.highlighted = 0

    def compose(self) -> ComposeResult:
        templates_section = Vertical(classes="mcps-templates-section")
        templates_section.border_title = "MCP Templates"
        templates_row = Horizontal(classes="templates-row")
        templates_row.compose_add_child(Static("Select template:", classes="mcp-label"))
        option_list = OptionList(id="template_selector", classes="template-selector")
        for template_name in MCP_TEMPLATES:
            option_list.add_option(Option(template_name.title(), id=template_name))
        templates_row.compose_add_child(option_list)
        templates_row.compose_add_child(
            Button(
                "Add from Template",
                id="add_from_template_button",
                classes="add-template-btn",
            )
        )
        templates_section.compose_add_child(templates_row)
        yield templates_section

        yield Button(
            "+ Add Custom MCP Server",
            id="add_custom_mcp_button",
            classes="add-custom-btn",
        )

        yield Vertical(id="mcps_container", classes="mcps-container")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id

        if button_id == "add_custom_mcp_button":
            self._add_mcp_server()
        elif button_id == "add_from_template_button":
            self._add_from_template()
        elif button_id and str(button_id).startswith("remove_mcp_"):
            index = int(str(button_id).replace("remove_mcp_", ""))
            self._remove_mcp_server(index)

    def on_radio_set_changed(self, event: RadioSet.Changed) -> None:
        radio_id = event.radio_set.id
        if radio_id and str(radio_id).startswith("mcp_transport_"):
            index = int(str(radio_id).replace("mcp_transport_", ""))
            if event.pressed:
                transport = str(event.pressed.id)
                self._update_transport_fields(index, transport)

    def _add_from_template(self) -> None:
        template_selector = self.query_one("#template_selector", OptionList)
        if template_selector.highlighted is not None:
            option_id = template_selector.get_option_at_index(
                template_selector.highlighted
            ).id
            if option_id and str(option_id) in MCP_TEMPLATES:
                template_data = MCP_TEMPLATES[str(option_id)].copy()
                self._add_mcp_server(template_data)
        else:
            self.app.notify("Please select a template first", severity="warning")

    def _add_mcp_server(self, template_data: dict = None) -> None:
        server_id = self.next_server_id
        self.next_server_id += 1
        self.mcp_servers.append(server_id)

        card = self._create_mcp_card(server_id, template_data)
        container = self.query_one("#mcps_container", Vertical)
        container.mount(card)

    def _remove_mcp_server(self, index: int) -> None:
        if index in self.mcp_servers:
            self.mcp_servers.remove(index)
            card = self.query_one(f"#mcp_card_{index}")
            card.remove()

    def _create_mcp_card(self, index: int, template_data: dict = None) -> Vertical:
        card = Vertical(id=f"mcp_card_{index}", classes="mcp-card")
        card.border_title = f"MCP Server {index + 1}"

        header = Horizontal(classes="mcp-header")
        name_value = template_data.get("name", "") if template_data else ""
        header.compose_add_child(
            Static(
                name_value or f"Server {index + 1}",
                id=f"mcp_name_display_{index}",
                classes="mcp-name-display",
            )
        )
        header.compose_add_child(
            Button("Remove", id=f"remove_mcp_{index}", classes="remove-mcp-btn")
        )
        card.compose_add_child(header)

        name_row = Horizontal(classes="mcp-field-row")
        name_row.compose_add_child(Static("Name:", classes="mcp-label"))
        name_row.compose_add_child(
            Input(
                value=name_value,
                placeholder="server-name",
                id=f"mcp_name_{index}",
                classes="mcp-input",
            )
        )
        card.compose_add_child(name_row)

        transport_row = Horizontal(classes="mcp-field-row")
        transport_row.compose_add_child(Static("Transport:", classes="mcp-label"))
        radio_set = RadioSet(id=f"mcp_transport_{index}")

        transport_value = (
            template_data.get("transport", "streamable_http")
            if template_data
            else "streamable_http"
        )
        radio_set.compose_add_child(
            RadioButton("stdio", id="stdio", value=(transport_value == "stdio"))
        )
        radio_set.compose_add_child(
            RadioButton("sse", id="sse", value=(transport_value == "sse"))
        )
        radio_set.compose_add_child(
            RadioButton(
                "streamable_http",
                id="streamable_http",
                value=(transport_value == "streamable_http"),
            )
        )
        radio_set.compose_add_child(
            RadioButton(
                "websocket", id="websocket", value=(transport_value == "websocket")
            )
        )
        transport_row.compose_add_child(radio_set)
        card.compose_add_child(transport_row)

        http_fields = Vertical(
            id=f"mcp_http_fields_{index}", classes="http-fields-container"
        )
        http_fields.border_title = "HTTP Configuration"

        url_row = Horizontal(classes="mcp-field-row")
        url_row.compose_add_child(Static("URL:", classes="mcp-label"))
        url_value = template_data.get("url", "") if template_data else ""
        url_row.compose_add_child(
            Input(
                value=url_value,
                placeholder="https://api.example.com/mcp",
                id=f"mcp_url_{index}",
                classes="mcp-input",
            )
        )
        http_fields.compose_add_child(url_row)

        headers_row = Horizontal(classes="mcp-field-row")
        headers_row.compose_add_child(Static("Headers (JSON):", classes="mcp-label"))
        headers_value = template_data.get("headers", "") if template_data else ""
        headers_row.compose_add_child(
            TextArea(
                text=str(headers_value) if headers_value else "",
                id=f"mcp_headers_{index}",
                classes="mcp-textarea",
            )
        )
        http_fields.compose_add_child(headers_row)

        http_fields.display = transport_value in ["sse", "streamable_http", "websocket"]
        card.compose_add_child(http_fields)

        stdio_fields = Vertical(
            id=f"mcp_stdio_fields_{index}", classes="stdio-fields-container"
        )
        stdio_fields.border_title = "Stdio Configuration"

        command_row = Horizontal(classes="mcp-field-row")
        command_row.compose_add_child(Static("Command:", classes="mcp-label"))
        command_value = template_data.get("command", "") if template_data else ""
        command_row.compose_add_child(
            Input(
                value=command_value,
                placeholder="npx",
                id=f"mcp_command_{index}",
                classes="mcp-input",
            )
        )
        stdio_fields.compose_add_child(command_row)

        args_row = Horizontal(classes="mcp-field-row")
        args_row.compose_add_child(Static("Args (one per line):", classes="mcp-label"))
        args_value = ""
        if template_data and "args" in template_data:
            args_list = template_data["args"]
            if isinstance(args_list, list):
                args_value = "\n".join(args_list)
        args_textarea = TextArea(
            text=args_value, id=f"mcp_args_{index}", classes="mcp-textarea"
        )
        args_textarea.placeholder = "run\n-i\n--rm"
        args_row.compose_add_child(args_textarea)
        stdio_fields.compose_add_child(args_row)

        env_row = Horizontal(classes="mcp-field-row")
        env_row.compose_add_child(Static("Env Vars (JSON):", classes="mcp-label"))
        env_value = ""
        if template_data and "env" in template_data:
            import json

            env_value = json.dumps(template_data["env"], indent=2)
        env_row.compose_add_child(
            TextArea(text=env_value, id=f"mcp_env_{index}", classes="mcp-textarea")
        )
        stdio_fields.compose_add_child(env_row)

        stdio_fields.display = transport_value == "stdio"
        card.compose_add_child(stdio_fields)

        return card

    def _update_transport_fields(self, index: int, transport: str) -> None:
        http_fields = self.query_one(f"#mcp_http_fields_{index}")
        stdio_fields = self.query_one(f"#mcp_stdio_fields_{index}")

        if transport in ["sse", "streamable_http", "websocket"]:
            http_fields.display = True
            stdio_fields.display = False
        elif transport == "stdio":
            http_fields.display = False
            stdio_fields.display = True

    def get_data(self) -> list[dict] | None:
        servers_data = []

        for server_id in self.mcp_servers:
            try:
                name_input = self.query_one(f"#mcp_name_{server_id}", Input)
                name = name_input.value

                if not name:
                    self.app.notify(
                        f"Server {server_id + 1}: Name is required", severity="error"
                    )
                    return None

                radio_set = self.query_one(f"#mcp_transport_{server_id}", RadioSet)
                transport = "streamable_http"
                if radio_set.pressed_button:
                    transport = str(radio_set.pressed_button.id)

                server_config = {
                    "name": name,
                    "transport": transport,
                }

                if transport in ["sse", "streamable_http", "websocket"]:
                    url_input = self.query_one(f"#mcp_url_{server_id}", Input)
                    server_config["url"] = url_input.value

                    headers_textarea = self.query_one(
                        f"#mcp_headers_{server_id}", TextArea
                    )
                    if headers_textarea.text.strip():
                        server_config["headers"] = headers_textarea.text.strip()

                elif transport == "stdio":
                    command_input = self.query_one(f"#mcp_command_{server_id}", Input)
                    server_config["command"] = command_input.value

                    args_textarea = self.query_one(f"#mcp_args_{server_id}", TextArea)
                    server_config["args"] = args_textarea.text

                    env_textarea = self.query_one(f"#mcp_env_{server_id}", TextArea)
                    if env_textarea.text.strip():
                        server_config["env"] = env_textarea.text.strip()

                servers_data.append(server_config)

            except Exception:
                self.app.notify(
                    f"Error reading MCP server {server_id + 1}: check your configuration.",
                    severity="error",
                )
                return None

        return servers_data
