"""Tests for ServerConfig schema validation."""

import pytest
import yaml
from pydantic import ValidationError

from idun_agent_engine.server.server_config import ServerAPIConfig, ServerConfig


@pytest.mark.unit
class TestServerConfig:
    """Test ServerConfig validation and serialization."""

    def test_server_config_from_yaml_string(self):
        """ServerConfig can be parsed from YAML."""
        yaml_content = """
        api:
          port: 5555
        """

        config_dict = yaml.safe_load(yaml_content)
        config = ServerConfig.model_validate(config_dict)

        assert config.api.port == 5555

    def test_server_config_validation_with_invalid_port(self):
        """Invalid port type raises ValidationError."""
        with pytest.raises(ValidationError):
            ServerAPIConfig(port="nan")  # type: ignore

    def test_server_config_nested_validation(self):
        """Nested config can be validated and round-tripped."""
        complex_config = {"api": {"port": 6666}}

        config = ServerConfig.model_validate(complex_config)
        assert config.api.port == 6666

        dumped = config.model_dump()
        reloaded = ServerConfig.model_validate(dumped)
        assert reloaded.api.port == config.api.port
