from idun_agent_schema.engine.observability_v2 import (
    ObservabilityConfig,
    ObservabilityProvider,
)
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Static, Input, RadioSet, RadioButton, Switch
from textual.widget import Widget
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Input, RadioButton, RadioSet, Static, Switch

from idun_platform_cli.tui.validators.observability import validate_observability


class ObservabilityWidget(Widget):
    selected_provider = reactive("OFF")

    def compose(self) -> ComposeResult:
        main_section = Vertical(classes="observability-main")
        main_section.border_title = "Observability"

        with main_section:
            with Horizontal(classes="field-row framework-row"):
                yield Static("Provider:", classes="field-label")
                with RadioSet(id="provider_select"):
                    yield RadioButton("Off", id="OFF", value=True)
                    yield RadioButton("LANGFUSE", id="LANGFUSE")
                    yield RadioButton("PHOENIX", id="PHOENIX")
                    yield RadioButton("GCP LOGGING", id="GCP_LOGGING")
                    yield RadioButton("GCP TRACE", id="GCP_TRACE")
                    yield RadioButton("LANGSMITH", id="LANGSMITH")

        provider_config = Vertical(
            classes="provider-config-container", id="provider_config"
        )
        yield provider_config

    def on_mount(self) -> None:
        self._update_provider_config()

    def on_radio_set_changed(self, event: RadioSet.Changed) -> None:
        if event.radio_set.id == "provider_select":
            self.selected_provider = str(event.pressed.id)
            self._update_provider_config()

    def _update_provider_config(self) -> None:
        config_container = self.query_one("#provider_config", Vertical)
        config_container.remove_children()

        if self.selected_provider == "OFF":
            pass
        elif self.selected_provider == "LANGFUSE":
            self._render_langfuse_config(config_container)
        elif self.selected_provider == "PHOENIX":
            self._render_phoenix_config(config_container)
        elif self.selected_provider == "GCP_LOGGING":
            self._render_gcp_logging_config(config_container)
        elif self.selected_provider == "GCP_TRACE":
            self._render_gcp_trace_config(config_container)
        elif self.selected_provider == "LANGSMITH":
            self._render_langsmith_config(config_container)

    def _render_langfuse_config(self, container: Vertical) -> None:
        config_section = Vertical(
            Horizontal(
                Static("Host:", classes="field-label"),
                Input(
                    value="https://cloud.langfuse.com",
                    id="langfuse_host",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Public Key:", classes="field-label"),
                Input(
                    placeholder="Enter public key",
                    id="langfuse_public_key",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Secret Key:", classes="field-label"),
                Input(
                    placeholder="Enter secret key",
                    password=True,
                    id="langfuse_secret_key",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Run Name:", classes="field-label"),
                Input(
                    placeholder="Optional run name",
                    id="langfuse_run_name",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            classes="provider-fields-section",
        )
        config_section.border_title = "Langfuse Configuration"
        container.mount(config_section)

    def _render_phoenix_config(self, container: Vertical) -> None:
        config_section = Vertical(
            Horizontal(
                Static("Endpoint:", classes="field-label"),
                Input(
                    value="http://localhost:6006",
                    id="phoenix_endpoint",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Project:", classes="field-label"),
                Input(
                    placeholder="Enter project name",
                    id="phoenix_project_name",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            classes="provider-fields-section",
        )
        config_section.border_title = "Phoenix Configuration"
        container.mount(config_section)

    def _render_gcp_logging_config(self, container: Vertical) -> None:
        config_section = Vertical(
            Horizontal(
                Static("Project ID:", classes="field-label"),
                Input(
                    placeholder="GCP project ID",
                    id="gcp_log_project_id",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Region:", classes="field-label"),
                Input(
                    placeholder="us-central1",
                    id="gcp_log_region",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Log Name:", classes="field-label"),
                Input(
                    placeholder="application-log",
                    id="gcp_log_name",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Resource:", classes="field-label"),
                Input(
                    placeholder="global",
                    id="gcp_log_resource_type",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Severity:", classes="field-label"),
                Input(value="INFO", id="gcp_log_severity", classes="field-input"),
                classes="field-row",
            ),
            Horizontal(
                Static("Transport:", classes="field-label"),
                Input(
                    value="BackgroundThread",
                    id="gcp_log_transport",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            classes="provider-fields-section",
        )
        config_section.border_title = "GCP Logging Configuration"
        container.mount(config_section)

    def _render_gcp_trace_config(self, container: Vertical) -> None:
        config_section = Vertical(
            Horizontal(
                Static("Project ID:", classes="field-label"),
                Input(
                    placeholder="GCP project ID",
                    id="gcp_trace_project_id",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Region:", classes="field-label"),
                Input(
                    placeholder="us-central1",
                    id="gcp_trace_region",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Trace Name:", classes="field-label"),
                Input(
                    placeholder="Trace session",
                    id="gcp_trace_name",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Sample Rate:", classes="field-label"),
                Input(value="1.0", id="gcp_trace_sampling_rate", classes="field-input"),
                classes="field-row",
            ),
            Horizontal(
                Static("Flush (sec):", classes="field-label"),
                Input(value="5", id="gcp_trace_flush_interval", classes="field-input"),
                classes="field-row",
            ),
            Horizontal(
                Static("Ignore URLs:", classes="field-label"),
                Input(
                    placeholder="/health,/metrics",
                    id="gcp_trace_ignore_urls",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            classes="provider-fields-section",
        )
        config_section.border_title = "GCP Trace Configuration"
        container.mount(config_section)

    def _render_langsmith_config(self, container: Vertical) -> None:
        config_section = Vertical(
            Horizontal(
                Static("API Key:", classes="field-label"),
                Input(
                    placeholder="Enter API key",
                    password=True,
                    id="langsmith_api_key",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Project ID:", classes="field-label"),
                Input(
                    placeholder="Project ID",
                    id="langsmith_project_id",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Project:", classes="field-label"),
                Input(
                    placeholder="prod-chatbot-v1",
                    id="langsmith_project_name",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Endpoint:", classes="field-label"),
                Input(
                    placeholder="https://api.smith.langchain.com",
                    id="langsmith_endpoint",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Trace Name:", classes="field-label"),
                Input(
                    placeholder="Trace session",
                    id="langsmith_trace_name",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            Horizontal(
                Static("Tracing:", classes="field-label"),
                Switch(value=False, id="langsmith_tracing_enabled"),
                classes="field-row",
            ),
            Horizontal(
                Static("Capture I/O:", classes="field-label"),
                Switch(value=False, id="langsmith_capture_io"),
                classes="field-row",
            ),
            classes="provider-fields-section",
        )
        config_section.border_title = "Langsmith Configuration"
        container.mount(config_section)

    def get_data(self) -> ObservabilityConfig | None:
        radio_set = self.query_one("#provider_select", RadioSet)

        provider = "OFF"
        if radio_set.pressed_button:
            provider = str(radio_set.pressed_button.id)

        if provider == "OFF":
            return None

        config = {}

        match provider:
            case "LANGFUSE":
                config = {
                    "host": self.query_one("#langfuse_host", Input).value,
                    "public_key": self.query_one("#langfuse_public_key", Input).value,
                    "secret_key": self.query_one("#langfuse_secret_key", Input).value,
                    "run_name": self.query_one("#langfuse_run_name", Input).value,
                }
            case "PHOENIX":
                config = {
                    "collector_endpoint": self.query_one(
                        "#phoenix_endpoint", Input
                    ).value,
                    "project_name": self.query_one(
                        "#phoenix_project_name", Input
                    ).value,
                }
            case "GCP_LOGGING":
                config = {
                    "project_id": self.query_one("#gcp_log_project_id", Input).value,
                    "region": self.query_one("#gcp_log_region", Input).value,
                    "log_name": self.query_one("#gcp_log_name", Input).value,
                    "resource_type": self.query_one(
                        "#gcp_log_resource_type", Input
                    ).value,
                    "severity": self.query_one("#gcp_log_severity", Input).value,
                    "transport": self.query_one("#gcp_log_transport", Input).value,
                }
            case "GCP_TRACE":
                config = {
                    "project_id": self.query_one("#gcp_trace_project_id", Input).value,
                    "region": self.query_one("#gcp_trace_region", Input).value,
                    "trace_name": self.query_one("#gcp_trace_name", Input).value,
                    "sampling_rate": float(
                        self.query_one("#gcp_trace_sampling_rate", Input).value or "1.0"
                    ),
                    "flush_interval": int(
                        self.query_one("#gcp_trace_flush_interval", Input).value or "5"
                    ),
                    "ignore_urls": self.query_one(
                        "#gcp_trace_ignore_urls", Input
                    ).value,
                }
            case "LANGSMITH":
                config = {
                    "api_key": self.query_one("#langsmith_api_key", Input).value,
                    "project_id": self.query_one("#langsmith_project_id", Input).value,
                    "project_name": self.query_one(
                        "#langsmith_project_name", Input
                    ).value,
                    "endpoint": self.query_one("#langsmith_endpoint", Input).value,
                    "trace_name": self.query_one("#langsmith_trace_name", Input).value,
                    "tracing_enabled": self.query_one(
                        "#langsmith_tracing_enabled", Switch
                    ).value,
                    "capture_inputs_outputs": self.query_one(
                        "#langsmith_capture_io", Switch
                    ).value,
                }

        provider = ObservabilityProvider(provider)
        validated, msg = validate_observability(provider, config)
        if not validated:
            self.app.notify(f"error validating observability config: {msg}")
            return None

        return validated
