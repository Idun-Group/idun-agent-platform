from idun_agent_engine.core.config_builder import ConfigBuilder
from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.server_runner import run_server

def main():
    agent_api_key= "Your agent api key"
    url = "the url that exposes your agent server"
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
