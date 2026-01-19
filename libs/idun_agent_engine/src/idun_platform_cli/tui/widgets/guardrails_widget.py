"""Guardrails configuration widget."""

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical, Grid
from textual.widgets import Static, Input, Switch, RadioSet, RadioButton, TextArea
from textual.widget import Widget

from idun_agent_schema.engine.guardrails_v2 import GuardrailsV2
from idun_platform_cli.tui.validators.guardrails import validate_guardrail


class GuardrailsWidget(Widget):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.guardrails_data = {
            "bias_check": {"enabled": False, "applies_to": "both", "config": {}},
            "toxic_language": {"enabled": False, "applies_to": "both", "config": {}},
            "competition_check": {"enabled": False, "applies_to": "both", "config": {}},
            "ban_list": {"enabled": False, "applies_to": "both", "config": {}},
            "detect_pii": {"enabled": False, "applies_to": "both", "config": {}},
        }

    def compose(self) -> ComposeResult:
        api_key_section = Vertical(classes="global-api-key-section")
        api_key_section.border_title = "Global API Key"
        api_key_section.compose_add_child(
            Static(
                "API Key (for guardrails that require it):", classes="gr-label-small"
            )
        )
        api_key_section.compose_add_child(
            Input(
                placeholder="Enter API key",
                password=True,
                id="global_guardrails_api_key",
            )
        )
        yield api_key_section

        grid = Grid(classes="guardrails-grid")
        for card in self._create_all_cards():
            grid.compose_add_child(card)
        yield grid

    def _create_all_cards(self):
        return [
            self._create_bias_check_card(),
            self._create_toxic_language_card(),
            self._create_competition_check_card(),
            self._create_ban_list_card(),
            self._create_detect_pii_card(),
        ]

    def _create_bias_check_card(self) -> Vertical:
        card = Vertical(classes="guardrail-card", id="bias_check_card")
        card.border_title = "Bias Check"

        header = Horizontal(classes="guardrail-header")
        header.compose_add_child(Static("Enabled:", classes="gr-label"))
        header.compose_add_child(Switch(value=False, id="bias_check_enabled"))
        card.compose_add_child(header)

        applies_section = Vertical(classes="applies-to-section")
        applies_section.compose_add_child(
            Static("Applies To:", classes="gr-label-small")
        )
        radio_set = RadioSet(id="bias_check_applies_to")
        radio_set.compose_add_child(RadioButton("Input", id="bias_check_input"))
        radio_set.compose_add_child(RadioButton("Output", id="bias_check_output"))
        radio_set.compose_add_child(
            RadioButton("Both", value=True, id="bias_check_both")
        )
        applies_section.compose_add_child(radio_set)
        card.compose_add_child(applies_section)

        config_section = Vertical(classes="config-section", id="bias_check_config")
        config_section.display = False
        config_section.compose_add_child(
            Static("Threshold (0.0-1.0):", classes="gr-label-small")
        )
        config_section.compose_add_child(
            Input(placeholder="0.5", id="bias_check_threshold")
        )
        card.compose_add_child(config_section)

        return card

    def _create_toxic_language_card(self) -> Vertical:
        card = Vertical(classes="guardrail-card", id="toxic_language_card")
        card.border_title = "Toxic Language"

        header = Horizontal(classes="guardrail-header")
        header.compose_add_child(Static("Enabled:", classes="gr-label"))
        header.compose_add_child(Switch(value=False, id="toxic_language_enabled"))
        card.compose_add_child(header)

        applies_section = Vertical(classes="applies-to-section")
        applies_section.compose_add_child(
            Static("Applies To:", classes="gr-label-small")
        )
        radio_set = RadioSet(id="toxic_language_applies_to")
        radio_set.compose_add_child(RadioButton("Input", id="toxic_language_input"))
        radio_set.compose_add_child(RadioButton("Output", id="toxic_language_output"))
        radio_set.compose_add_child(
            RadioButton("Both", value=True, id="toxic_language_both")
        )
        applies_section.compose_add_child(radio_set)
        card.compose_add_child(applies_section)

        config_section = Vertical(classes="config-section", id="toxic_language_config")
        config_section.display = False
        config_section.compose_add_child(
            Static("Threshold (0.0-1.0):", classes="gr-label-small")
        )
        config_section.compose_add_child(
            Input(placeholder="0.5", id="toxic_language_threshold")
        )
        card.compose_add_child(config_section)

        return card

    def _create_competition_check_card(self) -> Vertical:
        card = Vertical(classes="guardrail-card", id="competition_check_card")
        card.border_title = "Competition Check"

        header = Horizontal(classes="guardrail-header")
        header.compose_add_child(Static("Enabled:", classes="gr-label"))
        header.compose_add_child(Switch(value=False, id="competition_check_enabled"))
        card.compose_add_child(header)

        applies_section = Vertical(classes="applies-to-section")
        applies_section.compose_add_child(
            Static("Applies To:", classes="gr-label-small")
        )
        radio_set = RadioSet(id="competition_check_applies_to")
        radio_set.compose_add_child(RadioButton("Input", id="competition_check_input"))
        radio_set.compose_add_child(
            RadioButton("Output", id="competition_check_output")
        )
        radio_set.compose_add_child(
            RadioButton("Both", value=True, id="competition_check_both")
        )
        applies_section.compose_add_child(radio_set)
        card.compose_add_child(applies_section)

        config_section = Vertical(
            classes="config-section", id="competition_check_config"
        )
        config_section.display = False
        config_section.compose_add_child(
            Static("Competitors (comma-separated):", classes="gr-label-small")
        )
        competitors_textarea = TextArea(
            id="competition_check_competitors", classes="gr-textarea"
        )
        competitors_textarea.placeholder = (
            "e.g., Competitor-1, Competitor-2, Competitor-3..."
        )
        config_section.compose_add_child(competitors_textarea)
        card.compose_add_child(config_section)

        return card

    def _create_ban_list_card(self) -> Vertical:
        card = Vertical(classes="guardrail-card", id="ban_list_card")
        card.border_title = "Ban List"

        header = Horizontal(classes="guardrail-header")
        header.compose_add_child(Static("Enabled:", classes="gr-label"))
        header.compose_add_child(Switch(value=False, id="ban_list_enabled"))
        card.compose_add_child(header)

        applies_section = Vertical(classes="applies-to-section")
        applies_section.compose_add_child(
            Static("Applies To:", classes="gr-label-small")
        )
        radio_set = RadioSet(id="ban_list_applies_to")
        radio_set.compose_add_child(RadioButton("Input", id="ban_list_input"))
        radio_set.compose_add_child(RadioButton("Output", id="ban_list_output"))
        radio_set.compose_add_child(RadioButton("Both", value=True, id="ban_list_both"))
        applies_section.compose_add_child(radio_set)
        card.compose_add_child(applies_section)

        config_section = Vertical(classes="config-section", id="ban_list_config")
        config_section.display = False
        config_section.compose_add_child(
            Static("Reject Message:", classes="gr-label-small")
        )
        config_section.compose_add_child(
            Input(placeholder="Message to show", id="ban_list_reject_message")
        )
        config_section.compose_add_child(
            Static("Banned Words (comma-separated):", classes="gr-label-small")
        )
        banned_words_textarea = TextArea(
            id="ban_list_banned_words", classes="gr-textarea"
        )
        banned_words_textarea.placeholder = "Words to ban..."
        config_section.compose_add_child(banned_words_textarea)
        card.compose_add_child(config_section)

        return card

    def _create_detect_pii_card(self) -> Vertical:
        card = Vertical(classes="guardrail-card", id="detect_pii_card")
        card.border_title = "Detect PII"

        header = Horizontal(classes="guardrail-header")
        header.compose_add_child(Static("Enabled:", classes="gr-label"))
        header.compose_add_child(Switch(value=False, id="detect_pii_enabled"))
        card.compose_add_child(header)

        applies_section = Vertical(classes="applies-to-section")
        applies_section.compose_add_child(
            Static("Applies To:", classes="gr-label-small")
        )
        radio_set = RadioSet(id="detect_pii_applies_to")
        radio_set.compose_add_child(RadioButton("Input", id="detect_pii_input"))
        radio_set.compose_add_child(RadioButton("Output", id="detect_pii_output"))
        radio_set.compose_add_child(
            RadioButton("Both", value=True, id="detect_pii_both")
        )
        applies_section.compose_add_child(radio_set)
        card.compose_add_child(applies_section)

        config_section = Vertical(classes="config-section", id="detect_pii_config")
        config_section.display = False
        config_section.compose_add_child(
            Static("Reject Message:", classes="gr-label-small")
        )
        config_section.compose_add_child(
            Input(placeholder="Message to show", id="detect_pii_reject_message")
        )
        config_section.compose_add_child(
            Static("PII Entities (comma-separated):", classes="gr-label-small")
        )
        pii_entities_textarea = TextArea(
            id="detect_pii_pii_entities", classes="gr-textarea"
        )
        pii_entities_textarea.placeholder = "e.g., EMAIL_ADDRESS, PHONE_NUMBER, SSN..."
        config_section.compose_add_child(pii_entities_textarea)
        card.compose_add_child(config_section)

        return card

    def on_switch_changed(self, event: Switch.Changed) -> None:
        switch_id = event.switch.id
        if not switch_id:
            return

        guardrail_type = switch_id.replace("_enabled", "")
        config_section_id = f"{guardrail_type}_config"
        card_id = f"{guardrail_type}_card"

        try:
            config_section = self.query_one(f"#{config_section_id}")
            card = self.query_one(f"#{card_id}")

            config_section.display = event.value
            self.guardrails_data[guardrail_type]["enabled"] = event.value

            if event.value:
                card.add_class("guardrail-card-enabled")
            else:
                card.remove_class("guardrail-card-enabled")
        except:
            pass

    def get_data(self) -> GuardrailsV2 | None:
        input_guardrails = []
        output_guardrails = []

        for guardrail_id in self.guardrails_data.keys():
            enabled_switch = self.query_one(f"#{guardrail_id}_enabled", Switch)
            if not enabled_switch.value:
                continue

            applies_to_radioset = self.query_one(
                f"#{guardrail_id}_applies_to", RadioSet
            )
            pressed_button = applies_to_radioset.pressed_button
            if not pressed_button:
                applies_to = "both"
            else:
                button_id = str(pressed_button.id)
                if "input" in button_id:
                    applies_to = "input"
                elif "output" in button_id:
                    applies_to = "output"
                else:
                    applies_to = "both"

            config_dict = self._extract_config(guardrail_id)
            validated_config, msg = validate_guardrail(guardrail_id, config_dict)

            if not validated_config:
                self.app.notify(
                    f"Validation error for {guardrail_id}: {msg}", severity="error"
                )
                return None

            if applies_to in ["input", "both"]:
                input_guardrails.append(validated_config)
            if applies_to in ["output", "both"]:
                output_guardrails.append(validated_config)

        try:
            return GuardrailsV2(input=input_guardrails, output=output_guardrails)
        except Exception:
            self.app.notify(
                "Error validating Guardrails: make sure all fields are correct.",
                severity="error",
                timeout=10
            )
            return None

    def _extract_config(self, guardrail_id: str) -> dict:
        config = {}
        global_api_key = self.query_one("#global_guardrails_api_key", Input).value

        match guardrail_id:
            case "bias_check":
                threshold_input = self.query_one("#bias_check_threshold", Input)
                config["threshold"] = threshold_input.value or "0.5"

            case "toxic_language":
                threshold_input = self.query_one("#toxic_language_threshold", Input)
                config["threshold"] = threshold_input.value or "0.5"

            case "competition_check":
                competitors_textarea = self.query_one(
                    "#competition_check_competitors", TextArea
                )
                config["competitors"] = competitors_textarea.text

            case "ban_list":
                config["api_key"] = global_api_key
                config["reject_message"] = self.query_one(
                    "#ban_list_reject_message", Input
                ).value
                banned_words_textarea = self.query_one(
                    "#ban_list_banned_words", TextArea
                )
                config["banned_words"] = banned_words_textarea.text

            case "detect_pii":
                config["api_key"] = global_api_key
                config["reject_message"] = self.query_one(
                    "#detect_pii_reject_message", Input
                ).value
                pii_entities_textarea = self.query_one(
                    "#detect_pii_pii_entities", TextArea
                )
                config["pii_entities"] = pii_entities_textarea.text

        return config
