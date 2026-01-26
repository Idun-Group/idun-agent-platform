"""Chat widget for interacting with running agent."""

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Button, Input, Label, LoadingIndicator, RichLog


class ChatWidget(Widget):
    server_running = reactive(False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.config_data = {}
        self.server_port = None
        self.agent_name = ""

    def compose(self) -> ComposeResult:
        chat_container = Vertical(classes="chat-history-container")
        chat_container.border_title = "Conversation"
        with chat_container:
            yield RichLog(id="chat_history", highlight=True, markup=True, wrap=True)

        thinking_container = Horizontal(classes="chat-thinking-container", id="chat_thinking")
        thinking_container.display = False
        with thinking_container:
            yield LoadingIndicator(id="chat_spinner")
            yield Label("Thinking...", id="thinking_label")

        input_container = Horizontal(classes="chat-input-container")
        with input_container:
            yield Input(
                placeholder="Type your message...",
                id="chat_input",
                classes="chat-input",
            )
            yield Button("Send", id="send_button", classes="send-btn")

    def load_config(self, config: dict) -> None:
        self.config_data = config
        server_config = config.get("server", {})
        api_config = server_config.get("api", {})
        self.server_port = api_config.get("port", 8008)

        agent_config = config.get("agent", {}).get("config", {})
        self.agent_name = agent_config.get("name", "Agent")

        self.run_worker(self._check_server_status())

    def on_mount(self) -> None:
        chat_log = self.query_one("#chat_history", RichLog)
        chat_log.write("[dim]Start chatting with your agent...[/dim]")
        chat_log.write(
            "[dim]Make sure the agent server is running from the Serve page.[/dim]"
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "send_button":
            self._handle_send()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "chat_input":
            self._handle_send()

    def _handle_send(self) -> None:
        input_widget = self.query_one("#chat_input", Input)
        message = input_widget.value.strip()

        if not message:
            return

        if not self.server_port:
            self.app.notify("Server not configured", severity="error")
            return

        input_widget.value = ""

        chat_log = self.query_one("#chat_history", RichLog)
        chat_log.write(f"[cyan]You:[/cyan] {message}")

        thinking_container = self.query_one("#chat_thinking")
        thinking_container.display = True

        self.run_worker(self._send_message(message))

    async def _send_message(self, message: str) -> None:
        import httpx

        chat_log = self.query_one("#chat_history", RichLog)
        thinking_container = self.query_one("#chat_thinking")

        try:
            url = f"http://localhost:{self.server_port}/agent/invoke"
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    url, json={"session_id": "123", "query": message}
                )
                result = response.json()

                agent_response = result.get(
                    "output", result.get("response", "No response")
                )
                thinking_container.display = False
                chat_log.write(f"[green]{self.agent_name}:[/green] {agent_response}")

        except httpx.ConnectError:
            thinking_container.display = False
            chat_log.write("[red]Error:[/red] Cannot connect to server. Is it running?")
            self.app.notify(
                "Server not reachable. Start it from the Serve page.", severity="error"
            )
        except httpx.TimeoutException:
            thinking_container.display = False
            chat_log.write("[red]Error:[/red] Request timed out")
            self.app.notify("Request timed out", severity="error")
        except Exception as e:
            thinking_container.display = False
            chat_log.write(f"[red]Error:[/red] Failed to send message: {e}")
            self.app.notify(
                "Failed to send message. Check server connection.", severity="error"
            )

    async def _check_server_status(self) -> None:
        import httpx

        if not self.server_port:
            return

        try:
            url = f"http://localhost:{self.server_port}/health"
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(url)
                self.server_running = response.status_code == 200

                if self.server_running:
                    chat_log = self.query_one("#chat_history", RichLog)
                    chat_log.write(
                        f"[green]✓ Connected to server on port {self.server_port}[/green]"
                    )
        except Exception:
            self.server_running = False

    def watch_server_running(self, is_running: bool) -> None:
        input_widget = self.query_one("#chat_input", Input)
        send_button = self.query_one("#send_button", Button)

        if is_running:
            input_widget.disabled = False
            send_button.disabled = False
        else:
            input_widget.disabled = True
            send_button.disabled = True
