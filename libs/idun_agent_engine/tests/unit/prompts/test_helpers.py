"""Tests for idun_agent_engine.prompts.helpers module."""

from pathlib import Path
from unittest.mock import Mock, patch

import pytest
import yaml
from idun_agent_schema.engine.prompt import PromptConfig
from pydantic import ValidationError

SAMPLE_PROMPTS = [
    {
        "prompt_id": "system-prompt",
        "version": 2,
        "content": "You are a helpful assistant for {{ company }}.",
        "tags": ["latest", "production"],
    },
    {
        "prompt_id": "system-prompt",
        "version": 1,
        "content": "You are an assistant.",
        "tags": ["deprecated"],
    },
    {
        "prompt_id": "greeting",
        "version": 1,
        "content": "Hello {{ user_name }}!",
        "tags": ["latest"],
    },
]

# Reversed order: v1 before v2 — used to verify get_prompt returns first match,
# not highest version.
SAMPLE_PROMPTS_REVERSED = [
    {
        "prompt_id": "system-prompt",
        "version": 1,
        "content": "You are an assistant.",
        "tags": ["deprecated"],
    },
    {
        "prompt_id": "system-prompt",
        "version": 2,
        "content": "You are a helpful assistant for {{ company }}.",
        "tags": ["latest", "production"],
    },
]

SAMPLE_ENGINE_CONFIG = {
    "server": {"api": {"port": 8000}},
    "agent": {
        "type": "LANGGRAPH",
        "config": {"name": "test", "graph_definition": "a.py:g"},
    },
    "prompts": SAMPLE_PROMPTS,
}

SAMPLE_WRAPPED_CONFIG = {"engine_config": SAMPLE_ENGINE_CONFIG}


@pytest.mark.unit
class TestUnwrapEngineConfig:
    def test_returns_inner_when_wrapped(self) -> None:
        from idun_agent_engine.prompts.helpers import _unwrap_engine_config

        result = _unwrap_engine_config({"engine_config": {"agent": {}}})
        assert result == {"agent": {}}

    def test_returns_as_is_when_not_wrapped(self) -> None:
        from idun_agent_engine.prompts.helpers import _unwrap_engine_config

        data = {"agent": {}, "prompts": []}
        result = _unwrap_engine_config(data)
        assert result is data

    def test_raises_on_non_dict(self) -> None:
        from idun_agent_engine.prompts.helpers import _unwrap_engine_config

        with pytest.raises(ValueError, match="empty or invalid"):
            _unwrap_engine_config("not a dict")  # type: ignore[arg-type]

    def test_returns_empty_dict_as_is(self) -> None:
        from idun_agent_engine.prompts.helpers import _unwrap_engine_config

        result = _unwrap_engine_config({})
        assert result == {}


@pytest.mark.unit
class TestExtractPrompts:
    def test_extracts_prompts_from_config(self) -> None:
        from idun_agent_engine.prompts.helpers import _extract_prompts

        result = _extract_prompts(SAMPLE_ENGINE_CONFIG)
        assert len(result) == 3
        assert all(isinstance(p, PromptConfig) for p in result)
        assert result[0].prompt_id == "system-prompt"
        assert result[0].version == 2

    def test_returns_empty_when_no_prompts_key(self) -> None:
        from idun_agent_engine.prompts.helpers import _extract_prompts

        result = _extract_prompts({"agent": {}})
        assert result == []

    def test_returns_empty_when_prompts_is_none(self) -> None:
        from idun_agent_engine.prompts.helpers import _extract_prompts

        result = _extract_prompts({"prompts": None})
        assert result == []

    def test_raises_on_invalid_prompt_data(self) -> None:
        from idun_agent_engine.prompts.helpers import _extract_prompts

        # Missing required fields (prompt_id, content)
        with pytest.raises(ValidationError):
            _extract_prompts({"prompts": [{"version": 1}]})


@pytest.mark.unit
class TestGetPromptsFromFile:
    def test_loads_prompts_from_yaml(self, tmp_path: Path) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_file

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(SAMPLE_ENGINE_CONFIG))

        result = get_prompts_from_file(config_file)
        assert len(result) == 3
        assert result[0].prompt_id == "system-prompt"
        assert result[0].content == "You are a helpful assistant for {{ company }}."

    def test_loads_from_wrapped_config(self, tmp_path: Path) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_file

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(SAMPLE_WRAPPED_CONFIG))

        result = get_prompts_from_file(config_file)
        assert len(result) == 3

    def test_returns_empty_when_no_prompts_in_file(self, tmp_path: Path) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_file

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump({"agent": {"type": "LANGGRAPH"}}))

        result = get_prompts_from_file(config_file)
        assert result == []

    def test_raises_on_missing_file(self) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_file

        with pytest.raises(FileNotFoundError, match="not found"):
            get_prompts_from_file("/nonexistent/config.yaml")

    def test_accepts_string_path(self, tmp_path: Path) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_file

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(SAMPLE_ENGINE_CONFIG))

        result = get_prompts_from_file(str(config_file))
        assert len(result) == 3


@pytest.mark.unit
class TestGetPromptsFromApi:
    @patch("idun_agent_engine.prompts.helpers.requests.get")
    def test_fetches_and_parses_prompts(self, mock_get: Mock) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_api

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(SAMPLE_WRAPPED_CONFIG)
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        with patch.dict(
            "os.environ",
            {
                "IDUN_AGENT_API_KEY": "test-key",
                "IDUN_MANAGER_HOST": "http://localhost:8000",
            },
        ):
            result = get_prompts_from_api()

        assert len(result) == 3
        assert result[0].prompt_id == "system-prompt"
        mock_get.assert_called_once_with(
            url="http://localhost:8000/api/v1/agents/config",
            headers={"auth": "Bearer test-key"},
            timeout=(2, 3),
        )

    @patch("idun_agent_engine.prompts.helpers.requests.get")
    def test_strips_trailing_slash_from_host(self, mock_get: Mock) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_api

        mock_response = Mock()
        mock_response.text = yaml.dump(SAMPLE_WRAPPED_CONFIG)
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        with patch.dict(
            "os.environ",
            {
                "IDUN_AGENT_API_KEY": "key",
                "IDUN_MANAGER_HOST": "http://localhost:8000/",
            },
        ):
            get_prompts_from_api()

        mock_get.assert_called_once_with(
            url="http://localhost:8000/api/v1/agents/config",
            headers={"auth": "Bearer key"},
            timeout=(2, 3),
        )

    def test_returns_empty_without_api_key(self) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_api

        with patch.dict(
            "os.environ",
            {"IDUN_AGENT_API_KEY": "", "IDUN_MANAGER_HOST": "http://localhost"},
        ):
            assert get_prompts_from_api() == []

    def test_returns_empty_without_manager_host(self) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_api

        with patch.dict(
            "os.environ",
            {"IDUN_AGENT_API_KEY": "key", "IDUN_MANAGER_HOST": ""},
        ):
            assert get_prompts_from_api() == []

    @patch("idun_agent_engine.prompts.helpers.requests.get")
    def test_returns_empty_on_http_error(self, mock_get: Mock) -> None:
        import requests as req

        from idun_agent_engine.prompts.helpers import get_prompts_from_api

        mock_response = Mock()
        mock_response.raise_for_status.side_effect = req.HTTPError(
            "500 Server Error"
        )
        mock_get.return_value = mock_response

        with patch.dict(
            "os.environ",
            {
                "IDUN_AGENT_API_KEY": "key",
                "IDUN_MANAGER_HOST": "http://localhost:8000",
            },
        ):
            assert get_prompts_from_api() == []

    @patch("idun_agent_engine.prompts.helpers.requests.get")
    def test_returns_empty_on_invalid_yaml_response(self, mock_get: Mock) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts_from_api

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.text = "{{invalid: yaml: [["
        mock_get.return_value = mock_response

        with patch.dict(
            "os.environ",
            {
                "IDUN_AGENT_API_KEY": "key",
                "IDUN_MANAGER_HOST": "http://localhost:8000",
            },
        ):
            assert get_prompts_from_api() == []


@pytest.mark.unit
class TestGetPrompts:
    def test_uses_provided_path(self, tmp_path: Path) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(SAMPLE_ENGINE_CONFIG))

        result = get_prompts(config_path=config_file)
        assert len(result) == 3

    def test_uses_env_var_fallback(self, tmp_path: Path) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(SAMPLE_ENGINE_CONFIG))

        with patch.dict("os.environ", {"IDUN_CONFIG_PATH": str(config_file)}):
            result = get_prompts()

        assert len(result) == 3

    @patch("idun_agent_engine.prompts.helpers.get_prompts_from_api")
    def test_falls_back_to_api(self, mock_api: Mock) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts

        mock_api.return_value = [
            PromptConfig(prompt_id="x", version=1, content="hi")
        ]

        with patch.dict(
            "os.environ",
            {
                "IDUN_AGENT_API_KEY": "k",
                "IDUN_MANAGER_HOST": "http://h",
                "IDUN_CONFIG_PATH": "",
            },
        ):
            result = get_prompts()

        assert len(result) == 1
        mock_api.assert_called_once()

    def test_provided_path_takes_priority_over_env(self, tmp_path: Path) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts

        file_a = tmp_path / "a.yaml"
        file_a.write_text(yaml.dump(SAMPLE_ENGINE_CONFIG))

        file_b = tmp_path / "b.yaml"
        file_b.write_text(yaml.dump({"agent": {}}))

        with patch.dict("os.environ", {"IDUN_CONFIG_PATH": str(file_b)}):
            result = get_prompts(config_path=file_a)

        # From file_a (3 prompts), not file_b (0 prompts)
        assert len(result) == 3

    def test_env_var_pointing_to_missing_file_raises(self) -> None:
        from idun_agent_engine.prompts.helpers import get_prompts

        with patch.dict(
            "os.environ", {"IDUN_CONFIG_PATH": "/tmp/nonexistent.yaml"}
        ):
            with pytest.raises(FileNotFoundError):
                get_prompts()


@pytest.mark.unit
class TestGetPrompt:
    def test_returns_first_match_by_prompt_id(self, tmp_path: Path) -> None:
        """get_prompt returns the first entry matching prompt_id.

        The API returns versions sorted desc, so the first match is the latest.
        This test verifies get_prompt returns the first match (v2), not the
        highest version by comparison.
        """
        from idun_agent_engine.prompts.helpers import get_prompt

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(SAMPLE_ENGINE_CONFIG))

        result = get_prompt("system-prompt", config_path=config_file)
        assert result is not None
        assert result.prompt_id == "system-prompt"
        assert result.version == 2

    def test_returns_first_match_regardless_of_list_order(
        self, tmp_path: Path
    ) -> None:
        """When list order is v1 then v2, get_prompt returns v1 (first match)."""
        from idun_agent_engine.prompts.helpers import get_prompt

        config = {**SAMPLE_ENGINE_CONFIG, "prompts": SAMPLE_PROMPTS_REVERSED}
        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(config))

        result = get_prompt("system-prompt", config_path=config_file)
        assert result is not None
        # First match is v1 because the list has v1 before v2
        assert result.version == 1

    def test_returns_none_for_unknown_id(self, tmp_path: Path) -> None:
        from idun_agent_engine.prompts.helpers import get_prompt

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(SAMPLE_ENGINE_CONFIG))

        result = get_prompt("nonexistent", config_path=config_file)
        assert result is None

    @pytest.mark.parametrize(
        "prompt_id,expected_content",
        [
            ("system-prompt", "You are a helpful assistant for {{ company }}."),
            ("greeting", "Hello {{ user_name }}!"),
        ],
    )
    def test_returns_correct_content_by_id(
        self, tmp_path: Path, prompt_id: str, expected_content: str
    ) -> None:
        from idun_agent_engine.prompts.helpers import get_prompt

        config_file = tmp_path / "config.yaml"
        config_file.write_text(yaml.dump(SAMPLE_ENGINE_CONFIG))

        result = get_prompt(prompt_id, config_path=config_file)
        assert result is not None
        assert result.content == expected_content
