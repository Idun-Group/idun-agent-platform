"""Memory and checkpoint configuration widget."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import ValidationError
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.css.query import NoMatches
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Input, RadioButton, RadioSet, Static

if TYPE_CHECKING:
    from idun_agent_schema.engine.langgraph import CheckpointConfig


class MemoryWidget(Widget):
    selected_type = reactive("memory")

    def compose(self) -> ComposeResult:
        main_section = Vertical(classes="memory-main")
        main_section.border_title = "Checkpoint Configuration"

        with main_section, Horizontal(classes="field-row framework-row"):
            yield Static("Type:", classes="field-label")
            with RadioSet(id="checkpoint_type_select"):
                yield RadioButton("In-Memory", id="memory", value=True)
                yield RadioButton("SQLite", id="sqlite")
                yield RadioButton("PostgreSQL", id="postgres")

        config_container = Vertical(
            classes="checkpoint-config-container",
            id="checkpoint_config",
        )
        yield config_container

    def on_mount(self) -> None:
        self._update_checkpoint_config()

    def on_radio_set_changed(self, event: RadioSet.Changed) -> None:
        if event.radio_set.id == "checkpoint_type_select":
            self.selected_type = str(event.pressed.id)
            self._update_checkpoint_config()

    def _update_checkpoint_config(self) -> None:
        try:
            config_container = self.query_one("#checkpoint_config", Vertical)
            config_container.remove_children()

            if self.selected_type == "memory":
                pass
            elif self.selected_type == "sqlite":
                self._render_sqlite_config(config_container)
            elif self.selected_type == "postgres":
                self._render_postgres_config(config_container)
        except Exception:
            pass

    def _render_sqlite_config(self, container: Vertical) -> None:
        config_section = Vertical(
            Horizontal(
                Static("DB URL:", classes="field-label"),
                Input(
                    placeholder="sqlite:///./checkpoints.db",
                    id="sqlite_db_url",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            classes="checkpoint-fields-section",
        )
        config_section.border_title = "SQLite Configuration"
        container.mount(config_section)

    def _render_postgres_config(self, container: Vertical) -> None:
        config_section = Vertical(
            Horizontal(
                Static("DB URL:", classes="field-label"),
                Input(
                    placeholder="postgresql://user:pass@localhost:5432/db",
                    id="postgres_db_url",
                    classes="field-input",
                ),
                classes="field-row",
            ),
            classes="checkpoint-fields-section",
        )
        config_section.border_title = "PostgreSQL Configuration"
        container.mount(config_section)

    def get_data(self) -> CheckpointConfig | None:
        from idun_agent_schema.engine.langgraph import (
            InMemoryCheckpointConfig,
            PostgresCheckpointConfig,
            SqliteCheckpointConfig,
        )

        try:
            radio_set = self.query_one("#checkpoint_type_select", RadioSet)

            checkpoint_type = "memory"
            if radio_set.pressed_button:
                checkpoint_type = str(radio_set.pressed_button.id)

            if checkpoint_type == "memory":
                return InMemoryCheckpointConfig(type="memory")

            elif checkpoint_type == "sqlite":
                try:
                    db_url_input = self.query_one("#sqlite_db_url", Input)
                    db_url = db_url_input.value.strip()
                except NoMatches:
                    self.app.notify(
                        "Configuration error. Please reselect checkpoint type.",
                        severity="error",
                    )
                    return None

                if not db_url:
                    self.app.notify(
                        "SQLite DB URL is required",
                        severity="error",
                    )
                    return None

                if not db_url.startswith("sqlite:///"):
                    self.app.notify(
                        "SQLite URL must start with 'sqlite:///'",
                        severity="error",
                    )
                    return None

                try:
                    return SqliteCheckpointConfig(type="sqlite", db_url=db_url)
                except ValidationError:
                    self.app.notify(
                        "Invalid SQLite configuration. Check your URL format.",
                        severity="error",
                    )
                    return None

            elif checkpoint_type == "postgres":
                try:
                    db_url_input = self.query_one("#postgres_db_url", Input)
                    db_url = db_url_input.value.strip()
                except NoMatches:
                    self.app.notify(
                        "Configuration error. Please reselect checkpoint type.",
                        severity="error",
                    )
                    return None

                if not db_url:
                    self.app.notify(
                        "PostgreSQL DB URL is required",
                        severity="error",
                    )
                    return None

                if not (
                    db_url.startswith("postgresql://")
                    or db_url.startswith("postgres://")
                ):
                    self.app.notify(
                        "PostgreSQL URL must start with 'postgresql://' or 'postgres://'",
                        severity="error",
                    )
                    return None

                try:
                    return PostgresCheckpointConfig(type="postgres", db_url=db_url)
                except ValidationError:
                    self.app.notify(
                        "Invalid PostgreSQL configuration. Check your URL format.",
                        severity="error",
                    )
                    return None

        except NoMatches:
            self.app.notify(
                "Error reading checkpoint configuration",
                severity="error",
            )
            return None
        except Exception:
            self.app.notify(
                "Error validating checkpoint configuration",
                severity="error",
            )
            return None

        return None
