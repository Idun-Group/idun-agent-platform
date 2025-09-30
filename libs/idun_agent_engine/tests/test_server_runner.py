from unittest.mock import MagicMock, patch

import yaml

from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_engine.core.server_runner import (
    run_server_from_builder,
    run_server_from_config,
)


@patch("uvicorn.run")
@patch("idun_agent_engine.core.app_factory.create_app")
def test_run_server_from_config_uses_yaml_port(mock_create_app, mock_uvicorn, tmp_path):
    config_data = {
        "server": {"api": {"port": 3333}},
        "agent": {
            "type": "langgraph",
            "config": {
                "name": "Port Test Agent",
                "graph_definition": "./agent.py:graph",
            },
        },
    }

    config_file = tmp_path / "port_test.yaml"
    config_file.write_text(yaml.dump(config_data))

    mock_app = MagicMock()
    mock_create_app.return_value = mock_app

    run_server_from_config(str(config_file))

    mock_uvicorn.assert_called_once()
    call_kwargs = mock_uvicorn.call_args[1]
    assert call_kwargs["port"] == 3333


@patch("uvicorn.run")
@patch("idun_agent_engine.core.app_factory.create_app")
def test_run_server_from_builder_with_observability(mock_create_app, mock_uvicorn):
    mock_app = MagicMock()
    mock_create_app.return_value = mock_app

    builder = (
        ConfigBuilder()
        .with_api_port(4444)
        .with_langgraph_agent(
            name="Observable Agent",
            graph_definition="./agent.py:graph",
            observability={
                "provider": "phoenix",
                "enabled": True,
                "options": {"project_name": "test-project", "run_name": "test-run"},
            },
        )
    )

    run_server_from_builder(builder)

    created_config = mock_create_app.call_args[1]["engine_config"]
    assert created_config.server.api.port == 4444
    assert created_config.agent.config.observability.provider == "phoenix"
    assert created_config.agent.config.observability.enabled is True

    mock_uvicorn.assert_called_once()
    call_kwargs = mock_uvicorn.call_args[1]
    assert call_kwargs["port"] == 4444
