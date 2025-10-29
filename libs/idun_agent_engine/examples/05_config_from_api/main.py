from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.server_runner import run_server, run_server_from_builder

"""
curl -X 'GET' \
  'http://localhost:8000/api/v1/agents/config' \
  -H 'accept: application/json' \
  -H 'auth: Bearer c79c01ef086fb71a540194a79ddfd15ab76b8c296faaa9cdac2d958d37a42c74'
"""


def main():
    agent_api_key="4490747fa736ff9f799d79eede27d4039200eb93d40094ce95cecea5e62ab0e6"
    url = "http://localhost:8000/api/v1/agents/config" # todo: rename host, add url to create_app
    config = (
        ConfigBuilder()
        .with_config_from_api(agent_api_key=agent_api_key, url=url)
        .build()
    )
    print(f"✅ Created validated config: {config.agent.config.name}")
    app = create_app(engine_config=config)
    run_server(app, port=config.server.api.port, reload=True)


if __name__ == "__main__":
    main()
