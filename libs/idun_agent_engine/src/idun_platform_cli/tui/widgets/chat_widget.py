"""Chat widget for interacting with running agent."""

import json
import uuid

import httpx
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Button, Input, Label, LoadingIndicator, Markdown


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
            yield Markdown(id="chat_history")

        thinking_container = Horizontal(
            classes="chat-thinking-container", id="chat_thinking"
        )
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
        chat_log = self.query_one("#chat_history", Markdown)
        chat_log.update("*Start chatting with your agent...*\n\n*Make sure the agent server is running from the Serve page.*")

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

        chat_log = self.query_one("#chat_history", Markdown)
        self.run_worker(chat_log.append(f"\n\n**You:** {message}\n\n"))

        thinking_container = self.query_one("#chat_thinking")
        thinking_container.display = True

        self.run_worker(self._send_message(message))

    async def _send_message(self, message: str) -> None:
        chat_log = self.query_one("#chat_history", Markdown)
        thinking_container = self.query_one("#chat_thinking")
        agent_response_text = ""

        try:
            url = f"http://localhost:{self.server_port}/agent/copilotkit/stream"

            payload = {
                "threadId": str(uuid.uuid4()),
                "runId": str(uuid.uuid4()),
                "messages": [
                    {"role": "user", "content": message, "id": str(uuid.uuid4())}
                ],
                "state": None,
                "tools": [],
                "context": [],
                "forwardedProps": None,
            }

            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST", url, json=payload, headers={"Accept": "text/event-stream"}
                ) as response:
                    response.raise_for_status()

                    first_content = True

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            json_str = line[6:]

                            try:
                                event = json.loads(json_str)
                                event_type = event.get("type")

                                if event_type == "TEXT_MESSAGE_CONTENT":
                                    delta = event.get("delta", "")
                                    if delta:
                                        agent_response_text += delta

                                        if first_content:
                                            thinking_container.display = False
                                            await chat_log.append(f"**{self.agent_name}:** ")
                                            first_content = False

                                        await chat_log.append(delta)

                                elif event_type == "RAW":
                                    raw_event = event.get("event", {})
                                    if raw_event.get("event") == "on_chat_model_stream":
                                        chunk = raw_event.get("data", {}).get("chunk", {})
                                        content = chunk.get("content")

                                        if content is None:
                                            continue

                                        text_to_append = ""
                                        if isinstance(content, str):
                                            text_to_append = content
                                        elif isinstance(content, list):
                                            for item in content:
                                                if isinstance(item, dict):
                                                    item_type = item.get("type")
                                                    if item_type == "text":
                                                        text_to_append += item.get("text", "")

                                        if text_to_append:
                                            agent_response_text += text_to_append

                                            if first_content:
                                                thinking_container.display = False
                                                await chat_log.append(f"**{self.agent_name}:** ")
                                                first_content = False

                                            await chat_log.append(text_to_append)

                            except json.JSONDecodeError:
                                continue

                    thinking_container.display = False
                    if not agent_response_text:
                        await chat_log.append("\n\n*Agent completed without text response*")

        except httpx.ConnectError:
            thinking_container.display = False
            await chat_log.append("\n\n**Error:** Cannot connect to server. Is it running?")
            self.app.notify(
                "Server not reachable. Start it from the Serve page.", severity="error"
            )
        except httpx.TimeoutException:
            thinking_container.display = False
            if agent_response_text:
                await chat_log.append("\n\n**Warning:** Stream timed out (partial response shown)")
            else:
                await chat_log.append("\n\n**Error:** Request timed out")
            self.app.notify("Request timed out", severity="error")
        except httpx.HTTPStatusError as e:
            thinking_container.display = False
            await chat_log.append(f"\n\n**Error:** Server error: {e.response.status_code}")
            self.app.notify(f"Server error: {e.response.status_code}", severity="error")
        except Exception as e:
            thinking_container.display = False
            await chat_log.append(f"\n\n**Error:** Stream failed: {e}")
            self.app.notify(
                "Failed to send message. Check server connection.", severity="error"
            )

    async def _check_server_status(self) -> None:
        if not self.server_port:
            return

        try:
            url = f"http://localhost:{self.server_port}/health"
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(url)
                self.server_running = response.status_code == 200

                if self.server_running:
                    chat_log = self.query_one("#chat_history", Markdown)
                    await chat_log.append(
                        f"\n\n✓ **Connected to server on port {self.server_port}**"
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
