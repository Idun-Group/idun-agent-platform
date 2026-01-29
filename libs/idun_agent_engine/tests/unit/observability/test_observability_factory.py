import pytest
from unittest.mock import MagicMock, patch
from pydantic import ValidationError

from idun_agent_schema.engine.observability_v2 import (
    ObservabilityConfig,
    ObservabilityProvider,
    LangfuseConfig,
    PhoenixConfig,
)


@pytest.mark.unit
class TestObservabilitySchemaValidation:

    def test_observability_config_invalid_provider(self):
        with pytest.raises(ValidationError):
            ObservabilityConfig(
                enabled=True,
                provider="invalid-provider",
                config=LangfuseConfig(),
            )

    def test_observability_config_missing_config(self):
        with pytest.raises(ValidationError):
            ObservabilityConfig(
                enabled=True,
                provider=ObservabilityProvider.LANGFUSE,
            )

    def test_observability_config_wrong_config_type(self):
        with pytest.raises(ValidationError):
            ObservabilityConfig(
                enabled=True,
                provider=ObservabilityProvider.LANGFUSE,
                config="not-a-config-object",
            )


@pytest.mark.unit
class TestObservabilityFactory:

    def test_create_handler_returns_none_when_disabled(self):
        from idun_agent_engine.observability.base import create_observability_handler

        config = ObservabilityConfig(
            enabled=False,
            provider=ObservabilityProvider.LANGFUSE,
            config=LangfuseConfig(),
        )

        handler, info = create_observability_handler(config)

        assert handler is None
        assert info["enabled"] is False

    def test_create_handler_returns_none_when_config_is_none(self):
        from idun_agent_engine.observability.base import create_observability_handler

        handler, info = create_observability_handler(None)

        assert handler is None
        assert info["enabled"] is False

    @patch("idun_agent_engine.observability.langfuse.langfuse_handler.LangfuseHandler")
    def test_create_handler_langfuse(self, mock_handler_class):
        from idun_agent_engine.observability.base import create_observability_handler

        mock_handler = MagicMock()
        mock_handler.get_run_name.return_value = "test-run"
        mock_handler_class.return_value = mock_handler

        config = ObservabilityConfig(
            enabled=True,
            provider=ObservabilityProvider.LANGFUSE,
            config=LangfuseConfig(),
        )

        handler, info = create_observability_handler(config)

        assert handler is not None
        assert info["enabled"] is True
        assert info["provider"] == "langfuse"
        mock_handler_class.assert_called_once()

    @patch("idun_agent_engine.observability.phoenix.phoenix_handler.PhoenixHandler")
    def test_create_handler_phoenix(self, mock_handler_class):
        from idun_agent_engine.observability.base import create_observability_handler

        mock_handler = MagicMock()
        mock_handler.project_name = "test-project"
        mock_handler_class.return_value = mock_handler

        config = ObservabilityConfig(
            enabled=True,
            provider=ObservabilityProvider.PHOENIX,
            config=PhoenixConfig(),
        )

        handler, info = create_observability_handler(config)

        assert handler is not None
        assert info["enabled"] is True
        assert info["provider"] == "phoenix"
        assert info["project_name"] == "test-project"
        mock_handler_class.assert_called_once()

    @patch("idun_agent_engine.observability.gcp_logging.gcp_logging_handler.GCPLoggingHandler")
    def test_create_handler_gcp_logging(self, mock_handler_class):
        from idun_agent_engine.observability.base import create_observability_handler
        from idun_agent_schema.engine.observability_v2 import (
            GCPLoggingConfig,
        )

        mock_handler = MagicMock()
        mock_handler_class.return_value = mock_handler

        config = ObservabilityConfig(
            enabled=True,
            provider=ObservabilityProvider.GCP_LOGGING,
            config=GCPLoggingConfig(),
        )

        handler, info = create_observability_handler(config)

        assert handler is not None
        assert info["enabled"] is True
        assert info["provider"] == "gcp_logging"
        mock_handler_class.assert_called_once()

    @patch("idun_agent_engine.observability.gcp_trace.gcp_trace_handler.GCPTraceHandler")
    def test_create_handler_gcp_trace(self, mock_handler_class):
        from idun_agent_engine.observability.base import create_observability_handler
        from idun_agent_schema.engine.observability_v2 import (
            GCPTraceConfig,
        )

        mock_handler = MagicMock()
        mock_handler_class.return_value = mock_handler

        config = ObservabilityConfig(
            enabled=True,
            provider=ObservabilityProvider.GCP_TRACE,
            config=GCPTraceConfig(),
        )

        handler, info = create_observability_handler(config)

        assert handler is not None
        assert info["enabled"] is True
        assert info["provider"] == "gcp_trace"
        mock_handler_class.assert_called_once()

    def test_create_handler_unsupported_provider(self):
        from idun_agent_engine.observability.base import create_observability_handler

        config = {"enabled": True, "provider": "unsupported-provider", "options": {}}

        handler, info = create_observability_handler(config)

        assert handler is None
        assert info["enabled"] is False
        assert info["error"] == "Unsupported provider"

    def test_create_handler_missing_provider(self):
        from idun_agent_engine.observability.base import create_observability_handler

        config = {"enabled": True, "options": {}}

        handler, info = create_observability_handler(config)

        assert handler is None
        assert info["enabled"] is False

    def test_create_handler_empty_provider(self):
        from idun_agent_engine.observability.base import create_observability_handler

        config = {"enabled": True, "provider": "", "options": {}}

        handler, info = create_observability_handler(config)

        assert handler is None
        assert info["enabled"] is False


@pytest.mark.unit
class TestObservabilityMultipleHandlers:

    @patch("idun_agent_engine.observability.langfuse.langfuse_handler.LangfuseHandler")
    @patch("idun_agent_engine.observability.phoenix.phoenix_handler.PhoenixHandler")
    def test_create_multiple_handlers(self, mock_phoenix, mock_langfuse):
        from idun_agent_engine.observability.base import create_observability_handlers

        mock_langfuse_handler = MagicMock()
        mock_langfuse_handler.get_run_name.return_value = None
        mock_langfuse.return_value = mock_langfuse_handler

        mock_phoenix_handler = MagicMock()
        mock_phoenix.return_value = mock_phoenix_handler

        configs = [
            ObservabilityConfig(
                enabled=True,
                provider=ObservabilityProvider.LANGFUSE,
                config=LangfuseConfig(),
            ),
            ObservabilityConfig(
                enabled=True,
                provider=ObservabilityProvider.PHOENIX,
                config=PhoenixConfig(),
            ),
        ]

        handlers, infos = create_observability_handlers(configs)

        assert len(handlers) == 2
        assert len(infos) == 2
        assert infos[0]["provider"] == "langfuse"
        assert infos[1]["provider"] == "phoenix"

    def test_create_handlers_with_empty_list(self):
        from idun_agent_engine.observability.base import create_observability_handlers

        handlers, infos = create_observability_handlers([])

        assert handlers == []
        assert infos == []

    def test_create_handlers_with_none(self):
        from idun_agent_engine.observability.base import create_observability_handlers

        handlers, infos = create_observability_handlers(None)

        assert handlers == []
        assert infos == []

    @patch("idun_agent_engine.observability.langfuse.langfuse_handler.LangfuseHandler")
    def test_create_handlers_filters_disabled(self, mock_langfuse):
        from idun_agent_engine.observability.base import create_observability_handlers

        configs = [
            ObservabilityConfig(
                enabled=False,
                provider=ObservabilityProvider.LANGFUSE,
                config=LangfuseConfig(),
            ),
            ObservabilityConfig(
                enabled=True,
                provider=ObservabilityProvider.LANGFUSE,
                config=LangfuseConfig(),
            ),
        ]

        mock_handler = MagicMock()
        mock_handler.get_run_name.return_value = None
        mock_langfuse.return_value = mock_handler

        handlers, infos = create_observability_handlers(configs)

        assert len(handlers) == 1
        assert len(infos) == 2
        assert infos[0]["enabled"] is False
        assert infos[1]["enabled"] is True


@pytest.mark.unit
class TestConfigNormalization:

    def test_normalize_v2_config_enabled(self):
        from idun_agent_engine.observability.base import _normalize_config

        config = ObservabilityConfig(
            enabled=True,
            provider=ObservabilityProvider.LANGFUSE,
            config=LangfuseConfig(),
        )

        normalized = _normalize_config(config)

        assert normalized["enabled"] is True
        assert normalized["provider"] == "LANGFUSE"
        assert "options" in normalized

    def test_normalize_v2_config_disabled(self):
        from idun_agent_engine.observability.base import _normalize_config

        config = ObservabilityConfig(
            enabled=False,
            provider=ObservabilityProvider.LANGFUSE,
            config=LangfuseConfig(),
        )

        normalized = _normalize_config(config)

        assert normalized["enabled"] is False

    def test_normalize_dict_config(self):
        from idun_agent_engine.observability.base import _normalize_config

        config = {
            "enabled": True,
            "provider": "langfuse",
            "options": {"public_key": "test"},
        }

        normalized = _normalize_config(config)

        assert normalized["enabled"] is True
        assert normalized["provider"] == "langfuse"
        assert normalized["options"]["public_key"] == "test"

    def test_normalize_none_config(self):
        from idun_agent_engine.observability.base import _normalize_config

        normalized = _normalize_config(None)

        assert normalized["enabled"] is False

    def test_normalize_dict_missing_enabled(self):
        from idun_agent_engine.observability.base import _normalize_config

        config = {"provider": "langfuse", "options": {}}

        normalized = _normalize_config(config)

        assert normalized["enabled"] is False

    def test_normalize_dict_missing_provider(self):
        from idun_agent_engine.observability.base import _normalize_config

        config = {"enabled": True, "options": {}}

        normalized = _normalize_config(config)

        assert normalized["provider"] is None
        assert normalized["enabled"] is True

    def test_normalize_dict_missing_options(self):
        from idun_agent_engine.observability.base import _normalize_config

        config = {"enabled": True, "provider": "langfuse"}

        normalized = _normalize_config(config)

        assert normalized["options"] == {}

    def test_normalize_empty_dict(self):
        from idun_agent_engine.observability.base import _normalize_config

        normalized = _normalize_config({})

        assert normalized["enabled"] is False
        assert normalized["provider"] is None
        assert normalized["options"] == {}


