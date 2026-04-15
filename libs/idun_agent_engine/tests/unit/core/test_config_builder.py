"""Tests for the configuration builder API."""

from pathlib import Path
from unittest.mock import Mock, patch

import pytest
import yaml
from idun_agent_schema.engine.agent_framework import AgentFramework

from idun_agent_engine.core.config_builder import ConfigBuilder


@pytest.mark.unit
class TestConfigBuilderBasics:
    """Test basic configuration builder functionality."""

    def test_with_langgraph_agent_builds_engine_config(self, tmp_path: Path) -> None:
        """EngineConfig is built with expected values for a LangGraph agent."""
        builder = (
            ConfigBuilder()
            .with_api_port(9000)
            .with_langgraph_agent(
                name="UT Agent",
                graph_definition=str(tmp_path / "agent.py:graph"),
                sqlite_checkpointer=str(tmp_path / "agent.db"),
                observability={
                    "provider": "langfuse",
                    "enabled": False,
                    "options": {},
                },
            )
        )
        engine_config = builder.build()
        assert engine_config.server.api.port == 9000
        assert engine_config.agent.type == "LANGGRAPH"
        assert engine_config.agent.config.name == "UT Agent"

    def test_with_api_port_sets_port(self) -> None:
        """API port is set correctly."""
        builder = ConfigBuilder().with_api_port(8080)
        assert builder._server_config.api.port == 8080

    def test_with_server_config_sets_api_port(self) -> None:
        """Server config sets API port."""
        builder = ConfigBuilder().with_server_config(api_port=7000)
        assert builder._server_config.api.port == 7000

    def test_build_without_agent_raises_error(self) -> None:
        """Building without agent config raises ValueError."""
        builder = ConfigBuilder().with_api_port(8000)
        with pytest.raises(ValueError, match="Agent configuration is required"):
            builder.build()

    def test_build_returns_engine_config(self, tmp_path: Path) -> None:
        """build returns EngineConfig that can be dumped to dict."""
        builder = ConfigBuilder().with_langgraph_agent(
            name="Test", graph_definition=str(tmp_path / "agent.py:graph")
        )
        engine_config = builder.build()
        config_dict = engine_config.model_dump(mode="json")
        assert isinstance(config_dict, dict)
        assert config_dict["agent"]["type"] == "LANGGRAPH"
        assert config_dict["agent"]["config"]["name"] == "Test"


@pytest.mark.unit
class TestConfigBuilderFromDict:
    """Test creating ConfigBuilder from dictionary."""

    def test_from_dict_creates_builder(self, tmp_path: Path) -> None:
        """from_dict creates ConfigBuilder with correct configuration."""
        config_dict = {
            "server": {"api": {"port": 8080}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Dict Agent",
                    "graph_definition": str(tmp_path / "agent.py:graph"),
                },
            },
        }
        builder = ConfigBuilder.from_dict(config_dict)
        engine_config = builder.build()
        assert engine_config.server.api.port == 8080
        assert engine_config.agent.config.name == "Dict Agent"

    def test_from_dict_with_invalid_config_raises_error(self) -> None:
        """from_dict with invalid configuration raises validation error."""
        invalid_config = {
            "server": {"api": {"port": "invalid"}},  # Port should be int
            "agent": {"type": "LANGGRAPH", "config": {}},
        }
        with pytest.raises(Exception):  # Pydantic ValidationError  # noqa: B017
            ConfigBuilder.from_dict(invalid_config)


@pytest.mark.unit
class TestConfigBuilderFromFile:
    """Test loading configuration from YAML files."""

    def test_load_from_file_loads_config(self, tmp_path: Path) -> None:
        """load_from_file loads and validates configuration from YAML."""
        config_data = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "File Agent",
                    "graph_definition": "./agent.py:graph",
                },
            },
        }
        config_file = tmp_path / "test_config.yaml"
        with open(config_file, "w") as f:
            yaml.dump(config_data, f)

        engine_config = ConfigBuilder.load_from_file(str(config_file))
        assert engine_config.agent.config.name == "File Agent"
        assert engine_config.server.api.port == 8000

    def test_load_from_file_with_relative_path(self, tmp_path: Path) -> None:
        """load_from_file resolves relative paths."""
        config_data = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Relative Path Agent",
                    "graph_definition": "./agent.py:graph",
                },
            },
        }
        config_file = tmp_path / "config.yaml"
        with open(config_file, "w") as f:
            yaml.dump(config_data, f)

        # Test from different working directory
        with patch("pathlib.Path.cwd", return_value=tmp_path):
            engine_config = ConfigBuilder.load_from_file("config.yaml")
            assert engine_config.agent.config.name == "Relative Path Agent"

    def test_load_from_file_nonexistent_file_raises_error(self) -> None:
        """load_from_file with non-existent file raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            ConfigBuilder.load_from_file("/nonexistent/path/config.yaml")

    def test_from_file_creates_builder(self, tmp_path: Path) -> None:
        """from_file creates ConfigBuilder from YAML file."""
        config_data = {
            "server": {"api": {"port": 9000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Builder From File",
                    "graph_definition": "./agent.py:graph",
                },
            },
        }
        config_file = tmp_path / "builder_config.yaml"
        with open(config_file, "w") as f:
            yaml.dump(config_data, f)

        builder = ConfigBuilder.from_file(str(config_file))
        engine_config = builder.build()
        assert engine_config.server.api.port == 9000
        assert engine_config.agent.config.name == "Builder From File"


@pytest.mark.unit
class TestConfigBuilderResolveConfig:
    """Test config resolution from multiple sources."""

    def test_resolve_config_with_engine_config(self, tmp_path: Path) -> None:
        """resolve_config prioritizes pre-validated EngineConfig."""
        builder = ConfigBuilder().with_langgraph_agent(
            name="Priority Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        engine_config = builder.build()

        resolved = ConfigBuilder.resolve_config(engine_config=engine_config)
        assert resolved.agent.config.name == "Priority Agent"

    def test_resolve_config_with_dict(self, tmp_path: Path) -> None:
        """resolve_config uses config_dict when engine_config not provided."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Dict Config",
                    "graph_definition": str(tmp_path / "agent.py:graph"),
                },
            },
        }
        resolved = ConfigBuilder.resolve_config(config_dict=config_dict)
        assert resolved.agent.config.name == "Dict Config"

    def test_resolve_config_with_path(self, tmp_path: Path) -> None:
        """resolve_config loads from file path when dict not provided."""
        config_data = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "File Config",
                    "graph_definition": "./agent.py:graph",
                },
            },
        }
        config_file = tmp_path / "resolve_config.yaml"
        with open(config_file, "w") as f:
            yaml.dump(config_data, f)

        resolved = ConfigBuilder.resolve_config(config_path=str(config_file))
        assert resolved.agent.config.name == "File Config"

    def test_resolve_config_priority_order(self, tmp_path: Path) -> None:
        """resolve_config follows priority: engine_config > config_dict > config_path."""
        # Create engine_config with one name
        builder = ConfigBuilder().with_langgraph_agent(
            name="Engine Config Agent",
            graph_definition=str(tmp_path / "agent.py:graph"),
        )
        engine_config = builder.build()

        # Create config_dict with different name
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Dict Agent",
                    "graph_definition": str(tmp_path / "agent.py:graph"),
                },
            },
        }

        # engine_config should take priority
        resolved = ConfigBuilder.resolve_config(
            engine_config=engine_config, config_dict=config_dict
        )
        assert resolved.agent.config.name == "Engine Config Agent"


@pytest.mark.unit
class TestConfigBuilderSaveToFile:
    """Test saving configuration to file."""

    def test_save_to_file_creates_yaml(self, tmp_path: Path) -> None:
        """save_to_file writes configuration to YAML file."""
        builder = ConfigBuilder().with_langgraph_agent(
            name="Save Agent", graph_definition="./agent.py:graph"
        )
        output_file = tmp_path / "output_config.yaml"

        builder.save_to_file(str(output_file))

        assert output_file.exists()
        with open(output_file) as f:
            loaded_config = yaml.safe_load(f)
        assert loaded_config["agent"]["config"]["name"] == "Save Agent"


@pytest.mark.unit
class TestConfigBuilderValidateAgentConfig:
    """Test agent configuration validation."""

    def test_validate_agent_config_langgraph(self, tmp_path: Path) -> None:
        """validate_agent_config validates LangGraph config."""
        config = {
            "name": "Valid LangGraph",
            "graph_definition": str(tmp_path / "graph.py:graph"),
        }
        validated = ConfigBuilder.validate_agent_config("langgraph", config)
        assert validated["name"] == "Valid LangGraph"

    def test_validate_agent_config_invalid_raises_error(self) -> None:
        """validate_agent_config with invalid config raises error."""
        invalid_config = {"name": "Missing graph_definition"}
        with pytest.raises(Exception):  # Pydantic ValidationError  # noqa: B017
            ConfigBuilder.validate_agent_config("langgraph", invalid_config)

    def test_validate_agent_config_unsupported_type(self) -> None:
        """validate_agent_config with unsupported type raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported agent type"):
            ConfigBuilder.validate_agent_config("unsupported", {})


@pytest.mark.unit
class TestConfigBuilderWithConfigFromAPI:
    """Test fetching configuration from remote API."""

    @patch("requests.get")
    def test_with_config_from_api_success(self, mock_get: Mock, tmp_path: Path) -> None:
        """with_config_from_api fetches and parses config successfully."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 9000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "API Agent",
                            "graph_definition": "./agent.py:graph",
                        },
                    },
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        # Verify request was made with correct headers
        mock_get.assert_called_once_with(
            url="http://localhost:8000/api/v1/agents/config",
            headers={"auth": "Bearer test-key"},
        )

        # Verify config was parsed
        engine_config = builder.build()
        assert engine_config.agent.config.name == "API Agent"

    @patch("requests.get")
    def test_with_config_from_api_with_observability(self, mock_get: Mock) -> None:
        """with_config_from_api parses observability config."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "Observed Agent",
                            "graph_definition": "./agent.py:graph",
                        },
                    },
                    "observability": [
                        {
                            "provider": "LANGFUSE",
                            "enabled": True,
                            "config": {
                                "host": "https://cloud.langfuse.com",
                                "public_key": "pk-test",
                                "secret_key": "sk-test",
                            },
                        }
                    ],
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.observability is not None
        assert len(engine_config.observability) == 1
        assert engine_config.observability[0].provider.value == "LANGFUSE"

    @patch("requests.get")
    def test_with_config_from_api_http_error(self, mock_get: Mock) -> None:
        """with_config_from_api raises error on HTTP failure."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.json.return_value = {"error": "Unauthorized"}
        mock_get.return_value = mock_response

        with pytest.raises(ValueError, match="Error retrieving config from url"):
            ConfigBuilder().with_config_from_api(
                agent_api_key="invalid-key", url="http://localhost:8000"
            )

    @patch("requests.get")
    def test_with_config_from_api_invalid_yaml(self, mock_get: Mock) -> None:
        """with_config_from_api handles invalid YAML."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "invalid: yaml: content:"
        mock_get.return_value = mock_response

        with pytest.raises(Exception):  # YAML parsing error  # noqa: B017
            ConfigBuilder().with_config_from_api(
                agent_api_key="test-key", url="http://localhost:8000"
            ).build()


@pytest.mark.unit
class TestConfigBuilderSSO:
    """Test SSO configuration in ConfigBuilder."""

    def test_build_includes_sso_when_set(self, tmp_path: Path) -> None:
        """build() includes SSO config in the EngineConfig."""
        from idun_agent_schema.engine.sso import SSOConfig

        builder = ConfigBuilder().with_langgraph_agent(
            name="SSO Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._sso = SSOConfig(
            issuer="https://accounts.google.com",
            client_id="test-client-id",
        )
        engine_config = builder.build()
        assert engine_config.sso is not None
        assert engine_config.sso.issuer == "https://accounts.google.com"
        assert engine_config.sso.client_id == "test-client-id"

    def test_build_sso_none_by_default(self) -> None:
        """build() sets SSO to None when not configured."""
        builder = ConfigBuilder().with_langgraph_agent(
            name="No SSO Agent", graph_definition="./agent.py:graph"
        )
        engine_config = builder.build()
        assert engine_config.sso is None

    def test_build_sso_with_audience(self, tmp_path: Path) -> None:
        """build() preserves the optional audience field."""
        from idun_agent_schema.engine.sso import SSOConfig

        builder = ConfigBuilder().with_langgraph_agent(
            name="Okta Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._sso = SSOConfig(
            issuer="https://trial.okta.com/oauth2/default",
            client_id="okta-client-id",
            audience="api://default",
        )
        engine_config = builder.build()
        assert engine_config.sso is not None
        assert engine_config.sso.audience == "api://default"

    def test_from_dict_preserves_sso(self, tmp_path: Path) -> None:
        """from_dict copies SSO config into the builder."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Dict SSO Agent",
                    "graph_definition": str(tmp_path / "agent.py:graph"),
                },
            },
            "sso": {
                "issuer": "https://accounts.google.com",
                "client_id": "google-id",
            },
        }
        builder = ConfigBuilder.from_dict(config_dict)
        assert builder._sso is not None
        assert builder._sso.issuer == "https://accounts.google.com"

        engine_config = builder.build()
        assert engine_config.sso is not None
        assert engine_config.sso.client_id == "google-id"

    def test_from_engine_config_preserves_sso(self, tmp_path: Path) -> None:
        """from_engine_config copies SSO config into the builder."""
        from idun_agent_schema.engine.sso import SSOConfig

        builder = ConfigBuilder().with_langgraph_agent(
            name="SSO Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._sso = SSOConfig(
            issuer="https://accounts.google.com",
            client_id="test-id",
        )
        engine_config = builder.build()

        new_builder = ConfigBuilder.from_engine_config(engine_config)
        assert new_builder._sso is not None
        assert new_builder._sso.issuer == "https://accounts.google.com"

    @patch("requests.get")
    def test_with_config_from_api_parses_sso(self, mock_get: Mock) -> None:
        """with_config_from_api parses SSO config from API response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "API SSO Agent",
                            "graph_definition": "./agent.py:graph",
                        },
                    },
                    "sso": {
                        "issuer": "https://trial.okta.com/oauth2/default",
                        "client_id": "okta-client-id",
                        "audience": "api://default",
                    },
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.sso is not None
        assert engine_config.sso.issuer == "https://trial.okta.com/oauth2/default"
        assert engine_config.sso.client_id == "okta-client-id"
        assert engine_config.sso.audience == "api://default"

    @patch("requests.get")
    def test_with_config_from_api_without_sso(self, mock_get: Mock) -> None:
        """with_config_from_api sets SSO to None when not in response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "No SSO API Agent",
                            "graph_definition": "./agent.py:graph",
                        },
                    },
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.sso is None


@pytest.mark.unit
class TestConfigBuilderIntegrations:
    """Test integrations configuration in ConfigBuilder."""

    def test_build_includes_integrations_when_set(self, tmp_path: Path) -> None:
        """build() includes integrations config in the EngineConfig."""
        from idun_agent_schema.engine.integrations import (
            IntegrationConfig,
            IntegrationProvider,
        )

        builder = ConfigBuilder().with_langgraph_agent(
            name="Integration Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._integrations = [
            IntegrationConfig(
                provider=IntegrationProvider.WHATSAPP,
                enabled=True,
                config={
                    "access_token": "tok",
                    "phone_number_id": "123",
                    "verify_token": "vt",
                },
            )
        ]
        engine_config = builder.build()
        assert engine_config.integrations is not None
        assert len(engine_config.integrations) == 1
        assert engine_config.integrations[0].provider == IntegrationProvider.WHATSAPP

    def test_build_integrations_none_by_default(self) -> None:
        """build() sets integrations to None when not configured."""
        builder = ConfigBuilder().with_langgraph_agent(
            name="No Integrations Agent", graph_definition="./agent.py:graph"
        )
        engine_config = builder.build()
        assert engine_config.integrations is None

    def test_from_dict_preserves_integrations(self, tmp_path: Path) -> None:
        """from_dict copies integrations config into the builder."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Dict Integration Agent",
                    "graph_definition": str(tmp_path / "agent.py:graph"),
                },
            },
            "integrations": [
                {
                    "provider": "WHATSAPP",
                    "enabled": True,
                    "config": {
                        "access_token": "tok",
                        "phone_number_id": "123",
                        "verify_token": "vt",
                    },
                }
            ],
        }
        builder = ConfigBuilder.from_dict(config_dict)
        assert builder._integrations is not None
        assert len(builder._integrations) == 1

        engine_config = builder.build()
        assert engine_config.integrations is not None
        assert engine_config.integrations[0].config.phone_number_id == "123"

    def test_from_engine_config_preserves_integrations(self, tmp_path: Path) -> None:
        """from_engine_config copies integrations config into the builder."""
        from idun_agent_schema.engine.integrations import (
            IntegrationConfig,
            IntegrationProvider,
        )

        builder = ConfigBuilder().with_langgraph_agent(
            name="Integration Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._integrations = [
            IntegrationConfig(
                provider=IntegrationProvider.WHATSAPP,
                enabled=True,
                config={
                    "access_token": "tok",
                    "phone_number_id": "123",
                    "verify_token": "vt",
                },
            )
        ]
        engine_config = builder.build()

        new_builder = ConfigBuilder.from_engine_config(engine_config)
        assert new_builder._integrations is not None
        assert len(new_builder._integrations) == 1

    @patch("requests.get")
    def test_with_config_from_api_parses_integrations(self, mock_get: Mock) -> None:
        """with_config_from_api parses integrations config from API response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "API Integration Agent",
                            "graph_definition": "./agent.py:graph",
                        },
                    },
                    "integrations": [
                        {
                            "provider": "WHATSAPP",
                            "enabled": True,
                            "config": {
                                "access_token": "tok",
                                "phone_number_id": "456",
                                "verify_token": "vt",
                            },
                        }
                    ],
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.integrations is not None
        assert len(engine_config.integrations) == 1
        assert engine_config.integrations[0].config.phone_number_id == "456"

    @patch("requests.get")
    def test_with_config_from_api_without_integrations(self, mock_get: Mock) -> None:
        """with_config_from_api sets integrations to None when not in response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "No Integration API Agent",
                            "graph_definition": "./agent.py:graph",
                        },
                    },
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.integrations is None


@pytest.mark.unit
class TestConfigBuilderPrompts:
    """Test prompts configuration in ConfigBuilder."""

    def test_build_includes_prompts_when_set(self, tmp_path: Path) -> None:
        """build() includes prompts config in the EngineConfig."""
        from idun_agent_schema.engine.prompt import PromptConfig

        builder = ConfigBuilder().with_langgraph_agent(
            name="Prompt Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._prompts = [
            PromptConfig(
                prompt_id="system-prompt",
                version=1,
                content="You are a helpful assistant.",
                tags=["production"],
            )
        ]
        engine_config = builder.build()
        assert engine_config.prompts is not None
        assert len(engine_config.prompts) == 1
        assert engine_config.prompts[0].prompt_id == "system-prompt"
        assert engine_config.prompts[0].version == 1

    def test_build_prompts_none_by_default(self) -> None:
        """build() sets prompts to None when not configured."""
        builder = ConfigBuilder().with_langgraph_agent(
            name="No Prompts Agent", graph_definition="./agent.py:graph"
        )
        engine_config = builder.build()
        assert engine_config.prompts is None

    def test_from_dict_preserves_prompts(self, tmp_path: Path) -> None:
        """from_dict copies prompts config into the builder."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Dict Prompt Agent",
                    "graph_definition": str(tmp_path / "agent.py:graph"),
                },
            },
            "prompts": [
                {
                    "prompt_id": "rag-prompt",
                    "version": 2,
                    "content": "Answer: {{ query }}",
                    "tags": ["rag"],
                }
            ],
        }
        builder = ConfigBuilder.from_dict(config_dict)
        assert builder._prompts is not None
        assert len(builder._prompts) == 1

        engine_config = builder.build()
        assert engine_config.prompts is not None
        assert engine_config.prompts[0].prompt_id == "rag-prompt"
        assert engine_config.prompts[0].version == 2

    def test_from_engine_config_preserves_prompts(self, tmp_path: Path) -> None:
        """from_engine_config copies prompts config into the builder."""
        from idun_agent_schema.engine.prompt import PromptConfig

        builder = ConfigBuilder().with_langgraph_agent(
            name="Prompt Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._prompts = [
            PromptConfig(
                prompt_id="sys",
                version=1,
                content="Hello {{ name }}",
            )
        ]
        engine_config = builder.build()

        new_builder = ConfigBuilder.from_engine_config(engine_config)
        assert new_builder._prompts is not None
        assert len(new_builder._prompts) == 1
        assert new_builder._prompts[0].prompt_id == "sys"

    @patch("requests.get")
    def test_with_config_from_api_parses_prompts(self, mock_get: Mock) -> None:
        """with_config_from_api parses prompts config from API response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "API Prompt Agent",
                            "graph_definition": "./agent.py:graph",
                        },
                    },
                    "prompts": [
                        {
                            "prompt_id": "system",
                            "version": 3,
                            "content": "You are {{ role }}.",
                            "tags": ["v3"],
                        }
                    ],
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.prompts is not None
        assert len(engine_config.prompts) == 1
        assert engine_config.prompts[0].prompt_id == "system"
        assert engine_config.prompts[0].version == 3
        assert engine_config.prompts[0].content == "You are {{ role }}."

    @patch("requests.get")
    def test_with_config_from_api_without_prompts(self, mock_get: Mock) -> None:
        """with_config_from_api sets prompts to None when not in response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": {
                        "type": "LANGGRAPH",
                        "config": {
                            "name": "No Prompt API Agent",
                            "graph_definition": "./agent.py:graph",
                        },
                    },
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.prompts is None


@pytest.mark.unit
class TestConfigBuilderMCPServers:
    """Test MCP server configuration in ConfigBuilder."""

    _BASE_AGENT = {
        "type": "LANGGRAPH",
        "config": {"name": "MCP Agent", "graph_definition": "./agent.py:graph"},
    }

    _STDIO_MCP = {
        "name": "time",
        "transport": "stdio",
        "command": "docker",
        "args": ["run", "-i", "--rm", "mcp/time"],
    }

    _HTTP_MCP = {
        "name": "docs",
        "transport": "streamable_http",
        "url": "https://docs.example.com/mcp",
    }

    def test_build_includes_mcp_servers_when_set(self, tmp_path: Path) -> None:
        """build() includes MCP servers in the EngineConfig."""
        from idun_agent_schema.engine.mcp_server import MCPServer

        builder = ConfigBuilder().with_langgraph_agent(
            name="MCP Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._mcp_servers = [MCPServer.model_validate(self._STDIO_MCP)]
        engine_config = builder.build()
        assert engine_config.mcp_servers is not None
        assert len(engine_config.mcp_servers) == 1
        assert engine_config.mcp_servers[0].name == "time"
        assert engine_config.mcp_servers[0].transport == "stdio"

    def test_build_mcp_servers_none_by_default(self) -> None:
        """build() sets mcp_servers to None when not configured."""
        builder = ConfigBuilder().with_langgraph_agent(
            name="No MCP Agent", graph_definition="./agent.py:graph"
        )
        engine_config = builder.build()
        assert engine_config.mcp_servers is None

    def test_from_dict_preserves_mcp_servers(self) -> None:
        """from_dict copies MCP servers into the builder."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": self._BASE_AGENT,
            "mcp_servers": [self._STDIO_MCP],
        }
        builder = ConfigBuilder.from_dict(config_dict)
        assert builder._mcp_servers is not None
        assert len(builder._mcp_servers) == 1

        engine_config = builder.build()
        assert engine_config.mcp_servers is not None
        assert engine_config.mcp_servers[0].name == "time"
        assert engine_config.mcp_servers[0].transport == "stdio"
        assert engine_config.mcp_servers[0].command == "docker"

    def test_from_engine_config_preserves_mcp_servers(self, tmp_path: Path) -> None:
        """from_engine_config copies MCP servers into the builder."""
        from idun_agent_schema.engine.mcp_server import MCPServer

        builder = ConfigBuilder().with_langgraph_agent(
            name="MCP Agent", graph_definition=str(tmp_path / "agent.py:graph")
        )
        builder._mcp_servers = [MCPServer.model_validate(self._HTTP_MCP)]
        engine_config = builder.build()

        new_builder = ConfigBuilder.from_engine_config(engine_config)
        assert new_builder._mcp_servers is not None
        assert len(new_builder._mcp_servers) == 1
        assert new_builder._mcp_servers[0].name == "docs"
        assert new_builder._mcp_servers[0].transport == "streamable_http"
        assert new_builder._mcp_servers[0].url == "https://docs.example.com/mcp"

    def test_from_dict_empty_mcp_servers_list(self) -> None:
        """from_dict treats empty mcp_servers list as None."""
        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": self._BASE_AGENT,
            "mcp_servers": [],
        }
        builder = ConfigBuilder.from_dict(config_dict)
        engine_config = builder.build()
        # Empty list is preserved (not coerced to None) — Pydantic keeps it
        assert engine_config.mcp_servers is not None
        assert len(engine_config.mcp_servers) == 0

    @patch("requests.get")
    def test_with_config_from_api_parses_mcp_servers(self, mock_get: Mock) -> None:
        """with_config_from_api parses MCP servers from API response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": self._BASE_AGENT,
                    "mcp_servers": [self._STDIO_MCP, self._HTTP_MCP],
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.mcp_servers is not None
        assert len(engine_config.mcp_servers) == 2
        assert engine_config.mcp_servers[0].name == "time"
        assert engine_config.mcp_servers[0].transport == "stdio"
        assert engine_config.mcp_servers[0].command == "docker"
        assert engine_config.mcp_servers[1].name == "docs"
        assert engine_config.mcp_servers[1].transport == "streamable_http"
        assert engine_config.mcp_servers[1].url == "https://docs.example.com/mcp"

    @patch("requests.get")
    def test_with_config_from_api_without_mcp_servers(self, mock_get: Mock) -> None:
        """with_config_from_api sets mcp_servers to None when not in response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 8000}},
                    "agent": self._BASE_AGENT,
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.mcp_servers is None

    @patch("requests.get")
    def test_with_config_from_api_full_config(self, mock_get: Mock) -> None:
        """with_config_from_api parses all sections together."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = yaml.dump(
            {
                "engine_config": {
                    "server": {"api": {"port": 9000}},
                    "agent": self._BASE_AGENT,
                    "mcp_servers": [self._STDIO_MCP],
                    "observability": [
                        {
                            "provider": "LANGFUSE",
                            "enabled": True,
                            "config": {
                                "host": "https://cloud.langfuse.com",
                                "public_key": "pk",
                                "secret_key": "sk",
                            },
                        }
                    ],
                    "sso": {
                        "issuer": "https://accounts.google.com",
                        "client_id": "cid",
                    },
                }
            }
        )
        mock_get.return_value = mock_response

        builder = ConfigBuilder().with_config_from_api(
            agent_api_key="test-key", url="http://localhost:8000"
        )

        engine_config = builder.build()
        assert engine_config.server.api.port == 9000
        assert engine_config.agent.config.name == "MCP Agent"
        assert engine_config.mcp_servers is not None
        assert len(engine_config.mcp_servers) == 1
        assert engine_config.observability is not None
        assert len(engine_config.observability) == 1
        assert engine_config.sso is not None
        assert engine_config.sso.issuer == "https://accounts.google.com"


@pytest.mark.unit
class TestConfigBuilderGetAgentClass:
    """Test getting agent class by type."""

    def test_get_agent_class_langgraph(self) -> None:
        """get_agent_class returns LanggraphAgent for LANGGRAPH type."""
        from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent

        agent_class = ConfigBuilder.get_agent_class(AgentFramework.LANGGRAPH)
        assert agent_class == LanggraphAgent

    def test_get_agent_class_translation_agent(self) -> None:
        """get_agent_class returns LanggraphAgent for TRANSLATION_AGENT type."""
        from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent

        agent_class = ConfigBuilder.get_agent_class(AgentFramework.TRANSLATION_AGENT)
        assert agent_class == LanggraphAgent

    def test_get_agent_class_unsupported_type(self) -> None:
        """get_agent_class raises ValueError for unsupported type."""
        with pytest.raises(ValueError, match="Unsupported agent type"):
            ConfigBuilder.get_agent_class("unsupported_type")


@pytest.mark.unit
class TestConfigBuilderInitializeAgent:
    """Test agent initialization from configuration for all frameworks."""

    @pytest.mark.asyncio
    async def test_initialize_agent_langgraph(self) -> None:
        """Initialize LangGraph agent with mock graph fixture."""
        from idun_agent_engine.agent.langgraph.langgraph import LanggraphAgent

        engine_config = (
            ConfigBuilder()
            .with_langgraph_agent(
                name="Test LangGraph",
                graph_definition="tests.fixtures.agents.mock_graph:graph",
            )
            .build()
        )

        agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

        assert isinstance(agent, LanggraphAgent)
        assert agent.agent_type == "LangGraph"
        assert agent.name == "Test LangGraph"

    @pytest.mark.asyncio
    async def test_initialize_agent_haystack_pipeline(self) -> None:
        """Initialize Haystack agent with mock pipeline fixture."""
        from pathlib import Path

        from idun_agent_engine.agent.haystack.haystack import HaystackAgent

        mock_pipeline_path = (
            Path(__file__).parent.parent.parent
            / "fixtures"
            / "agents"
            / "mock_haystack_pipeline.py"
        )

        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "HAYSTACK",
                "config": {
                    "name": "Test Haystack Pipeline",
                    "component_type": "pipeline",
                    "component_definition": f"{mock_pipeline_path}:mock_haystack_pipeline",
                },
            },
        }
        engine_config = ConfigBuilder.from_dict(config_dict).build()

        agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

        assert isinstance(agent, HaystackAgent)
        assert agent.agent_type == "haystack"
        assert agent.name == "Test Haystack Pipeline"

    @pytest.mark.asyncio
    async def test_initialize_agent_haystack_agent(self) -> None:
        """Initialize Haystack agent with mock pipeline fixture."""
        from pathlib import Path

        from idun_agent_engine.agent.haystack.haystack import HaystackAgent

        mock_pipeline_path = (
            Path(__file__).parent.parent.parent
            / "fixtures"
            / "agents"
            / "mock_haystack_pipeline.py"
        )

        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "HAYSTACK",
                "config": {
                    "name": "Test Haystack Agent",
                    "component_type": "pipeline",
                    "component_definition": f"{mock_pipeline_path}:mock_haystack_pipeline",
                },
            },
        }
        engine_config = ConfigBuilder.from_dict(config_dict).build()

        agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

        assert isinstance(agent, HaystackAgent)
        assert agent.agent_type == "haystack"
        assert agent.name == "Test Haystack Agent"

    @pytest.mark.asyncio
    async def test_initialize_agent_adk(self) -> None:
        """Initialize ADK agent with mock agent fixture."""
        from pathlib import Path

        from idun_agent_engine.agent.adk.adk import AdkAgent

        mock_agent_path = (
            Path(__file__).parent.parent.parent
            / "fixtures"
            / "agents"
            / "mock_adk_agent.py"
        )

        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "ADK",
                "config": {
                    "name": "Test ADK Agent",
                    "agent": f"{mock_agent_path}:mock_adk_agent_instance",
                    "app_name": "test_adk_app",
                    "session_service": {"type": "in_memory"},
                    "memory_service": {"type": "in_memory"},
                },
            },
        }
        engine_config = ConfigBuilder.from_dict(config_dict).build()

        agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

        assert isinstance(agent, AdkAgent)
        assert agent.agent_type == "ADK"
        assert agent.name == "test_adk_app"

    @pytest.mark.asyncio
    async def test_initialize_agent_accepts_compiled_graph(self) -> None:
        """Initialize agent accepts a CompiledStateGraph by extracting .builder."""
        from langgraph.graph.state import CompiledStateGraph

        config_dict = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Compiled Graph Agent",
                    "graph_definition": "tests.fixtures.agents.mock_graph:compiled_graph",
                    "checkpointer": {"type": "memory"},
                },
            },
        }
        engine_config = ConfigBuilder.from_dict(config_dict).build()
        agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

        assert agent is not None
        assert isinstance(agent.agent_instance, CompiledStateGraph)
        assert agent.agent_instance.checkpointer is not None
