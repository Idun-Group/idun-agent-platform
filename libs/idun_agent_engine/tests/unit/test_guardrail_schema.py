"""Tests for guardrail schema: flattened models, backwards compat, api_key defaults."""

import pytest
from idun_agent_schema.engine.guardrails_v2 import (
    BanListConfig,
    BiasCheckConfig,
    CompetitionCheckConfig,
    CorrectLanguageConfig,
    DetectPIIConfig,
    GibberishTextConfig,
    GuardrailsV2,
    NSFWTextConfig,
    RestrictToTopicConfig,
    ToxicLanguageConfig,
)


class TestBanListConfigFlattened:
    """BanListConfig accepts flat banned_words and old guard_params format."""

    def test_flat_format(self):
        config = BanListConfig(banned_words=["bad", "worse"])
        assert config.banned_words == ["bad", "worse"]
        assert config.guard_url == "hub://guardrails/ban_list"
        assert config.reject_message == "ban!!"
        assert config.api_key == ""

    def test_flat_format_with_api_key(self):
        config = BanListConfig(api_key="my-key", banned_words=["bad"])
        assert config.api_key == "my-key"
        assert config.banned_words == ["bad"]

    def test_old_guard_params_format(self):
        config = BanListConfig.model_validate(
            {
                "api_key": "test-key",
                "guard_url": "hub://guardrails/ban_list",
                "reject_message": "ban!!",
                "guard_params": {"banned_words": ["badword", "spam"]},
            }
        )
        assert config.banned_words == ["badword", "spam"]
        assert config.api_key == "test-key"

    def test_old_guard_params_empty(self):
        config = BanListConfig.model_validate(
            {
                "guard_params": {},
                "banned_words": ["fallback"],
            }
        )
        assert config.banned_words == ["fallback"]

    def test_roundtrip(self):
        config = BanListConfig(api_key="k", banned_words=["x"])
        dumped = config.model_dump()
        assert "guard_params" not in dumped
        assert dumped["banned_words"] == ["x"]
        reloaded = BanListConfig.model_validate(dumped)
        assert reloaded.banned_words == ["x"]


class TestDetectPIIConfigFlattened:
    """DetectPIIConfig accepts flat pii_entities and old guard_params format."""

    def test_flat_format(self):
        config = DetectPIIConfig(pii_entities=["EMAIL_ADDRESS"])
        assert config.pii_entities == ["EMAIL_ADDRESS"]
        assert config.on_fail == "exception"
        assert config.guard_url == "hub://guardrails/detect_pii"
        assert config.api_key == ""

    def test_old_guard_params_format(self):
        config = DetectPIIConfig.model_validate(
            {
                "api_key": "test-key",
                "guard_url": "hub://guardrails/detect_pii",
                "reject_message": "PII detected",
                "guard_params": {
                    "pii_entities": ["EMAIL_ADDRESS", "PHONE_NUMBER"],
                    "on_fail": "exception",
                },
            }
        )
        assert config.pii_entities == ["EMAIL_ADDRESS", "PHONE_NUMBER"]
        assert config.on_fail == "exception"

    def test_roundtrip(self):
        config = DetectPIIConfig(pii_entities=["SSN"], on_fail="exception")
        dumped = config.model_dump()
        assert "guard_params" not in dumped
        assert dumped["pii_entities"] == ["SSN"]
        reloaded = DetectPIIConfig.model_validate(dumped)
        assert reloaded.pii_entities == ["SSN"]


class TestApiKeyDefaults:
    """All engine guardrail models accept api_key='' by default."""

    @pytest.mark.parametrize(
        "model_cls,kwargs",
        [
            (BanListConfig, {"banned_words": ["x"]}),
            (DetectPIIConfig, {"pii_entities": ["EMAIL_ADDRESS"]}),
            (BiasCheckConfig, {"threshold": 0.5}),
            (CompetitionCheckConfig, {"competitors": ["Acme"]}),
            (CorrectLanguageConfig, {"expected_languages": ["en"]}),
            (GibberishTextConfig, {"threshold": 0.5}),
            (NSFWTextConfig, {"threshold": 0.5}),
            (RestrictToTopicConfig, {"topics": ["support"]}),
            (ToxicLanguageConfig, {"threshold": 0.5}),
        ],
    )
    def test_default_empty_api_key(self, model_cls, kwargs):
        config = model_cls(**kwargs)
        assert config.api_key == ""

    @pytest.mark.parametrize(
        "model_cls,kwargs",
        [
            (BanListConfig, {"banned_words": ["x"]}),
            (DetectPIIConfig, {"pii_entities": ["EMAIL_ADDRESS"]}),
            (BiasCheckConfig, {"threshold": 0.5}),
            (CompetitionCheckConfig, {"competitors": ["Acme"]}),
            (CorrectLanguageConfig, {"expected_languages": ["en"]}),
            (GibberishTextConfig, {"threshold": 0.5}),
            (NSFWTextConfig, {"threshold": 0.5}),
            (RestrictToTopicConfig, {"topics": ["support"]}),
            (ToxicLanguageConfig, {"threshold": 0.5}),
        ],
    )
    def test_explicit_api_key(self, model_cls, kwargs):
        config = model_cls(api_key="my-key", **kwargs)
        assert config.api_key == "my-key"


class TestGuardrailsV2MixedFormats:
    """GuardrailsV2 validates lists with mixed old and new formats."""

    def test_mixed_input_list(self):
        data = {
            "input": [
                {
                    "config_id": "ban_list",
                    "api_key": "k",
                    "guard_params": {"banned_words": ["old-format"]},
                },
                {
                    "config_id": "toxic_language",
                    "api_key": "k",
                    "threshold": 0.5,
                },
                {
                    "config_id": "ban_list",
                    "banned_words": ["new-format"],
                },
            ],
            "output": [],
        }
        guardrails = GuardrailsV2.model_validate(data)
        assert len(guardrails.input) == 3
        assert guardrails.input[0].banned_words == ["old-format"]
        assert guardrails.input[2].banned_words == ["new-format"]
