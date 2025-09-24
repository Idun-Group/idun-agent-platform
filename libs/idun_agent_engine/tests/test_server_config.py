import pytest
import yaml
from pydantic import ValidationError

from idun_agent_engine.server.server_config import ServerAPIConfig, ServerConfig


def test_server_config_from_yaml_string():
    yaml_content = """
    api:
      port: 5555
    """

    config_dict = yaml.safe_load(yaml_content)
    config = ServerConfig.model_validate(config_dict)

    assert config.api.port == 5555


def test_server_config_validation_with_invalid_port():
    with pytest.raises(ValidationError):
        ServerAPIConfig(port="nan")  # type: ignore


def test_server_config_nested_validation():
    complex_config = {"api": {"port": 6666}}

    config = ServerConfig.model_validate(complex_config)
    assert config.api.port == 6666

    dumped = config.model_dump()
    reloaded = ServerConfig.model_validate(dumped)
    assert reloaded.api.port == config.api.port
