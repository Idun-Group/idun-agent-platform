"""Tests for BanListConfig guardrail."""

from idun_agent_schema.engine.guardrails import Guardrail

import os
from unittest.mock import MagicMock, patch

import pytest
from idun_agent_schema.engine.guardrails_v2 import BanListConfig, GuardrailConfigId


class TestBanListConfig:
    """Test BanListConfig guardrail."""

    @pytest.fixture(scope="class", autouse=True)
    def install_model(self):
        import subprocess

        from guardrails import install

        api_key = os.getenv("GUARDRAILS_API_KEY")
        if not api_key:
            pytest.skip("GUARDRAILS_API_KEY not set")
        try:
            print("Configuring guardrails with token...")
            result = subprocess.run(
                [
                    "guardrails",
                    "configure",
                    "--token",
                    self.api_key,
                    "--disable-remote-inferencing",
                    "--disable-metrics",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            print(f"Configure output: {result.stdout}")
            if result.stderr:
                print(f"Configure stderr: {result.stderr}")
            install("hub://guardrails/ban_list", quiet=True, install_local_models=True)
        except subprocess.CalledProcessError as e:
            raise OSError(
                f"Cannot configure guardrails: stdout={e.stdout}, stderr={e.stderr}"
            ) from e
        except Exception as e:
            raise e

    from idun_agent_engine.guardrails.guardrails_hub import GuardrailsHubGuard

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_init_with_ban_list_config(self, mock_setup_guard):
        """Test initializing GuardrailsHubGuard with BanListConfig."""
        mock_setup_guard.return_value = MagicMock()

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned word detected",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["badword1", "badword2"]},
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert guard.guard_id == GuardrailConfigId.BAN_LIST
        assert guard._guard_url == "hub://guardrails/ban_list"
        assert guard.reject_message == "Banned word detected"
        assert guard.position == "input"
        assert guard._guardrail_config == config

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_ban_list_stores_banned_words(self, mock_setup_guard):
        """Test that banned_words are properly stored."""
        mock_setup_guard.return_value = MagicMock()

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["word1", "word2", "word3"]},
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert guard._guardrail_config.guard_params.banned_words == [
            "word1",
            "word2",
            "word3",
        ]

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_ban_list_empty_banned_words(self, mock_setup_guard):
        """Test BanListConfig with empty banned_words list."""
        mock_setup_guard.return_value = MagicMock()

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": []},
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert guard._guardrail_config.guard_params.banned_words == []

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_ban_list_custom_reject_message(self, mock_setup_guard):
        """Test BanListConfig with custom reject message."""
        mock_setup_guard.return_value = MagicMock()

        config = BanListConfig(
            api_key="test_key",
            reject_message="Custom banned message",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert guard.reject_message == "Custom banned message"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_ban_list_position_input(self, mock_setup_guard):
        """Test BanListConfig with input position."""
        mock_setup_guard.return_value = MagicMock()

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert guard.position == "input"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard.setup_guard"
    )
    def test_ban_list_position_output(self, mock_setup_guard):
        """Test BanListConfig with output position."""
        mock_setup_guard.return_value = MagicMock()

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        guard = GuardrailsHubGuard(config, position="output")

        assert guard.position == "output"
