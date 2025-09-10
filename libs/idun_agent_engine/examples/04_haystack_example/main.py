
"""Example 1: Basic configuration file runner."""

from pathlib import Path

from dotenv import load_dotenv

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.server_runner import run_server

load_dotenv()

# # Print current sys.path before adding project root
# print("Python path before:", sys.path)

# # Add the project root to the Python path
# project_root = Path(__file__).parent.parent.parent
# sys.path.insert(0, str(project_root))

# # Print current sys.path after adding project root
# print("Python path:", sys.path)


def main():
    """Run the agent server using YAML configuration."""
    print("🔧 Starting Idun Agent Engine with YAML configuration...")

    # Path to our configuration file
    config_path = str(Path(__file__).parent / "config.yaml")

    # Create the FastAPI app with our configuration
    app = create_app(config_path=config_path)
    print("[FROM APP]: ", app.state._state)

    # Run the server with development settings
    run_server(app, reload=True)


if __name__ == "__main__":
    main()
