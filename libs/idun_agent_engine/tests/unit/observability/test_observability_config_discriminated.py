"""Tests for the discriminated-union shape of ObservabilityConfig.config."""

from __future__ import annotations

import pytest
from idun_agent_schema.engine.observability_v2 import (
    GCPLoggingConfig,
    GCPTraceConfig,
    LangfuseConfig,
    LangsmithConfig,
    ObservabilityConfig,
    ObservabilityProvider,
    PhoenixConfig,
)
from pydantic import ValidationError


@pytest.mark.unit
class TestObservabilityConfigDiscriminator:
    def test_langfuse_provider_with_langfuse_config_validates(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.LANGFUSE,
            config=LangfuseConfig(host="https://example.com"),
        )
        assert config.provider == ObservabilityProvider.LANGFUSE
        assert isinstance(config.config, LangfuseConfig)
        assert config.config.host == "https://example.com"

    def test_phoenix_provider_with_phoenix_config_validates(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.PHOENIX,
            config=PhoenixConfig(project_name="proj"),
        )
        assert isinstance(config.config, PhoenixConfig)

    @pytest.mark.parametrize(
        "provider, wrong_config",
        [
            (ObservabilityProvider.LANGFUSE, PhoenixConfig()),
            (ObservabilityProvider.LANGFUSE, GCPTraceConfig()),
            (ObservabilityProvider.PHOENIX, LangfuseConfig()),
            (ObservabilityProvider.PHOENIX, LangsmithConfig()),
            (ObservabilityProvider.GCP_LOGGING, PhoenixConfig()),
            (ObservabilityProvider.GCP_TRACE, LangfuseConfig()),
            (ObservabilityProvider.LANGSMITH, GCPTraceConfig()),
        ],
    )
    def test_provider_with_mismatched_config_fails(self, provider, wrong_config):
        with pytest.raises(ValidationError) as excinfo:
            ObservabilityConfig(provider=provider, config=wrong_config)
        # Discriminator error mentions the provider field somewhere in the chain.
        assert "provider" in str(excinfo.value).lower()

    def test_provider_omitted_uses_inner_config_provider(self):
        # If only the inner config is provided, the parent's provider must
        # auto-sync to it (back-compat: caller may have set provider only on
        # the parent, only on the inner, or both).
        config = ObservabilityConfig(config=GCPTraceConfig())
        assert config.provider == ObservabilityProvider.GCP_TRACE

    def test_inner_provider_default_matches_class(self):
        # Each member config defaults its `provider` literal to the matching
        # ObservabilityProvider value, so existing call sites that omit it
        # still load.
        assert LangfuseConfig().provider == ObservabilityProvider.LANGFUSE
        assert PhoenixConfig().provider == ObservabilityProvider.PHOENIX
        assert GCPLoggingConfig().provider == ObservabilityProvider.GCP_LOGGING
        assert GCPTraceConfig().provider == ObservabilityProvider.GCP_TRACE
        assert LangsmithConfig().provider == ObservabilityProvider.LANGSMITH

    def test_existing_call_pattern_still_works(self):
        # Sanity: this is exactly the pattern the existing
        # test_observability_factory.py uses; must continue to validate.
        config = ObservabilityConfig(
            enabled=True,
            provider=ObservabilityProvider.LANGFUSE,
            config=LangfuseConfig(),
        )
        assert config.enabled is True
        assert config.provider == ObservabilityProvider.LANGFUSE

    @pytest.mark.parametrize(
        "provider, inner_dict, inner_cls",
        [
            (
                ObservabilityProvider.LANGFUSE,
                {"host": "https://example.com"},
                LangfuseConfig,
            ),
            (
                ObservabilityProvider.PHOENIX,
                {"project_name": "p"},
                PhoenixConfig,
            ),
            (
                ObservabilityProvider.GCP_LOGGING,
                {"project_id": "p"},
                GCPLoggingConfig,
            ),
            (
                ObservabilityProvider.GCP_TRACE,
                {"project_id": "p"},
                GCPTraceConfig,
            ),
            (
                ObservabilityProvider.LANGSMITH,
                {"api_key": "k"},
                LangsmithConfig,
            ),
        ],
    )
    def test_dict_input_back_compat_parent_provider_only(
        self, provider, inner_dict, inner_cls
    ):
        """Existing YAML shape: parent has provider, inner dict does not."""
        cfg = ObservabilityConfig.model_validate(
            {"provider": provider.value, "enabled": True, "config": inner_dict}
        )
        assert isinstance(cfg.config, inner_cls)
        assert cfg.provider == provider
        assert cfg.config.provider == provider
