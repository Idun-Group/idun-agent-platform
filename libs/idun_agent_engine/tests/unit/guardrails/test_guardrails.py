"""Tests for guardrails base functionality."""

from unittest.mock import MagicMock, patch

import pytest
from idun_agent_schema.engine.guardrails_v2 import (
    BanListConfig,
    DetectPIIConfig,
    GuardrailConfigId,
)

from idun_agent_engine.guardrails.base import BaseGuardrail
from idun_agent_engine.guardrails.guardrails_hub.guardrails_hub import (
    GuardrailsHubGuard,
    get_guard_instance,
)

from guardrails import install


"""


"""


class TestGetGuardInstance:
    """Test get_guard_instance function."""

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.BanList",
        create=True,
    )
    def test_get_guard_instance_ban_list(self, mock_ban_list):
        """Test getting BanList guard class."""
        mock_ban_list.__name__ = "BanList"
        with patch.dict(
            "sys.modules", {"guardrails.hub": MagicMock(BanList=mock_ban_list)}
        ):
            guard_class = get_guard_instance(GuardrailConfigId.BAN_LIST)
            assert guard_class is not None
            assert guard_class.__name__ == "BanList"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.DetectPII",
        create=True,
    )
    def test_get_guard_instance_detect_pii(self, mock_detect_pii):
        """Test getting DetectPII guard class."""
        mock_detect_pii.__name__ = "DetectPII"
        with patch.dict(
            "sys.modules", {"guardrails.hub": MagicMock(DetectPII=mock_detect_pii)}
        ):
            guard_class = get_guard_instance(GuardrailConfigId.DETECT_PII)
            assert guard_class is not None
            assert guard_class.__name__ == "DetectPII"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.NSFWText",
        create=True,
    )
    def test_get_guard_instance_nsfw(self, mock_nsfw):
        """Test getting NSFWText guard class."""
        mock_nsfw.__name__ = "NSFWText"
        with patch.dict(
            "sys.modules", {"guardrails.hub": MagicMock(NSFWText=mock_nsfw)}
        ):
            guard_class = get_guard_instance(GuardrailConfigId.NSFW_TEXT)
            assert guard_class is not None
            assert guard_class.__name__ == "NSFWText"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.CompetitorCheck",
        create=True,
    )
    def test_get_guard_instance_competitor_check(self, mock_comp):
        """Test getting CompetitorCheck guard class."""
        mock_comp.__name__ = "CompetitorCheck"
        with patch.dict(
            "sys.modules", {"guardrails.hub": MagicMock(CompetitorCheck=mock_comp)}
        ):
            guard_class = get_guard_instance(GuardrailConfigId.COMPETITION_CHECK)
            assert guard_class is not None
            assert guard_class.__name__ == "CompetitorCheck"


class TestBaseGuardrail:
    """Test BaseGuardrail class."""

    def test_init_with_valid_config(self):
        """Test BaseGuardrail accepts valid GuardrailConfig."""
        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        with patch.multiple(BaseGuardrail, __abstractmethods__=set()):
            guardrail = BaseGuardrail(config)
            assert guardrail._guardrail_config == config
            assert guardrail._instance_config is None

    def test_init_with_invalid_config_raises_typeerror(self):
        """Test BaseGuardrail raises TypeError with invalid config."""
        with patch.multiple(BaseGuardrail, __abstractmethods__=set()):
            with pytest.raises(TypeError, match="must be a `Guardrail` schema type"):
                BaseGuardrail({"invalid": "config"})

    def test_init_with_string_raises_typeerror(self):
        """Test BaseGuardrail raises TypeError with string."""
        with patch.multiple(BaseGuardrail, __abstractmethods__=set()):
            with pytest.raises(TypeError, match="must be a `Guardrail` schema type"):
                BaseGuardrail("not a config")

    def test_init_with_none_raises_typeerror(self):
        """Test BaseGuardrail raises TypeError with None."""
        with patch.multiple(BaseGuardrail, __abstractmethods__=set()):
            with pytest.raises(TypeError, match="must be a `Guardrail` schema type"):
                BaseGuardrail(None)


class TestGuardrailsHubGuard:
    """Test GuardrailsHubGuard class common functionality."""

    def test_install_model_success(self):
        """Test _install_model successfully configures and installs guardrail."""
        import os

        api_key = os.getenv("GUARDRAILS_API_KEY")
        if not api_key:
            pytest.skip("GUARDRAILS_API_KEY not set")

        config = BanListConfig(
            api_key=api_key,
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        with patch.object(GuardrailsHubGuard, "setup_guard", return_value=MagicMock()):
            guard = GuardrailsHubGuard(config, position="input")
            guard._install_model()

    @patch("subprocess.run")
    def test_install_model_configure_fails(self, mock_subprocess_run):
        """Test _install_model raises OSError when configuration fails."""
        import os
        from subprocess import CalledProcessError

        api_key = os.getenv("GUARDRAILS_API_KEY")
        if not api_key:
            pytest.skip("GUARDRAILS_API_KEY not set")

        exc = CalledProcessError(returncode=1, cmd=["guardrails"])
        exc.stdout = "error"
        exc.stderr = "config failed"
        mock_subprocess_run.side_effect = exc

        config = BanListConfig(
            api_key=api_key,
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        with patch.object(GuardrailsHubGuard, "setup_guard", return_value=MagicMock()):
            guard = GuardrailsHubGuard(config, position="input")

            with pytest.raises(OSError, match="Cannot configure guardrails"):
                guard._install_model()

    @patch("subprocess.run")
    def test_install_model_includes_stderr_in_error(self, mock_subprocess_run):
        """Test _install_model includes stderr in error message."""
        import os
        from subprocess import CalledProcessError

        api_key = os.getenv("GUARDRAILS_API_KEY")
        if not api_key:
            pytest.skip("GUARDRAILS_API_KEY not set")

        exc = CalledProcessError(returncode=1, cmd=["guardrails"])
        exc.stdout = "out"
        exc.stderr = "detailed error message"
        mock_subprocess_run.side_effect = exc

        config = BanListConfig(
            api_key=api_key,
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        with patch.object(GuardrailsHubGuard, "setup_guard", return_value=MagicMock()):
            guard = GuardrailsHubGuard(config, position="input")

            with pytest.raises(OSError, match="detailed error message"):
                guard._install_model()

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard._install_model"
    )
    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.get_guard_instance"
    )
    def test_setup_guard_creates_guard_instance(
        self, mock_get_guard_instance, mock_install_model
    ):
        """Test setup_guard creates and configures a guard instance."""
        mock_install_model.return_value = None

        mock_guard_class = MagicMock()
        mock_guard_instance = MagicMock()
        mock_guard_class.return_value = mock_guard_instance
        mock_get_guard_instance.return_value = mock_guard_class

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["word1", "word2"]},
        )

        guard = GuardrailsHubGuard(config, position="input")

        mock_install_model.assert_called_once()
        mock_get_guard_instance.assert_called_once_with(GuardrailConfigId.BAN_LIST)
        mock_guard_class.assert_called_once_with(banned_words=["word1", "word2"])
        assert guard._guard == mock_guard_instance

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard._install_model"
    )
    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.get_guard_instance"
    )
    def test_setup_guard_sets_attributes_on_guard(
        self, mock_get_guard_instance, mock_install_model
    ):
        """Test setup_guard sets attributes on the guard instance."""
        mock_install_model.return_value = None

        mock_guard_class = MagicMock()
        mock_guard_instance = MagicMock()
        mock_guard_class.return_value = mock_guard_instance
        mock_get_guard_instance.return_value = mock_guard_class

        config = DetectPIIConfig(
            api_key="test_key",
            reject_message="PII",
            guard_url="hub://guardrails/detect_pii",
            guard_params={
                "pii_entities": ["EMAIL_ADDRESS", "SSN"],
                "on_fail": "exception",
            },
        )

        guard = GuardrailsHubGuard(config, position="input")

        assert mock_guard_instance.pii_entities == ["EMAIL_ADDRESS", "SSN"]
        assert mock_guard_instance.on_fail == "exception"

    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard._install_model"
    )
    @patch(
        "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.get_guard_instance"
    )
    def test_setup_guard_raises_on_none_guard(
        self, mock_get_guard_instance, mock_install_model
    ):
        """Test setup_guard raises ValueError when get_guard_instance returns None."""
        mock_install_model.return_value = None
        mock_get_guard_instance.return_value = None

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        with pytest.raises(ValueError, match="is not yet supported"):
            GuardrailsHubGuard(config, position="input")

    @patch("idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.Guard")
    def test_validate_returns_true_on_success(self, mock_guard_class):
        """Test validate returns True when validation passes."""
        mock_guard_instance = MagicMock()
        mock_guard_instance.validate.return_value = None
        mock_guard_class.return_value.use.return_value = mock_guard_instance

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["badword"]},
        )

        with patch.object(GuardrailsHubGuard, "setup_guard", return_value=MagicMock()):
            guard = GuardrailsHubGuard(config, position="input")
            result = guard.validate("this is a safe message")

        assert result is True
        mock_guard_instance.validate.assert_called_once_with("this is a safe message")

    @patch("idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.Guard")
    def test_validate_returns_false_on_failure(self, mock_guard_class):
        """Test validate returns False when validation fails."""
        mock_guard_instance = MagicMock()
        mock_guard_instance.validate.side_effect = Exception("Validation failed")
        mock_guard_class.return_value.use.return_value = mock_guard_instance

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["badword"]},
        )

        with patch.object(GuardrailsHubGuard, "setup_guard", return_value=MagicMock()):
            guard = GuardrailsHubGuard(config, position="input")
            result = guard.validate("message with badword")

        assert result is False

    @patch("idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.Guard")
    def test_validate_catches_all_exceptions(self, mock_guard_class):
        """Test validate catches all exception types."""
        mock_guard_instance = MagicMock()
        mock_guard_instance.validate.side_effect = RuntimeError("Runtime error")
        mock_guard_class.return_value.use.return_value = mock_guard_instance

        config = DetectPIIConfig(
            api_key="test_key",
            reject_message="PII",
            guard_url="hub://guardrails/detect_pii",
            guard_params={"pii_entities": ["EMAIL_ADDRESS"], "on_fail": "exception"},
        )

        with patch.object(GuardrailsHubGuard, "setup_guard", return_value=MagicMock()):
            guard = GuardrailsHubGuard(config, position="output")
            result = guard.validate("test@example.com")

        assert result is False

    @patch("idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.Guard")
    def test_validate_uses_guard_wrapper(self, mock_guard_class):
        """Test validate creates Guard wrapper and uses the guard instance."""
        mock_guard_wrapper = MagicMock()
        mock_guard_instance = MagicMock()
        mock_guard_class.return_value = mock_guard_wrapper
        mock_guard_wrapper.use.return_value = mock_guard_instance
        mock_guard_instance.validate.return_value = None

        config = BanListConfig(
            api_key="test_key",
            reject_message="Banned",
            guard_url="hub://guardrails/ban_list",
            guard_params={"banned_words": ["test"]},
        )

        with patch.object(
            GuardrailsHubGuard, "setup_guard", return_value=MagicMock()
        ) as mock_setup:
            guard = GuardrailsHubGuard(config, position="input")
            guard.validate("test message")

        mock_guard_class.assert_called_once()
        mock_guard_wrapper.use.assert_called_once_with(mock_setup.return_value)
