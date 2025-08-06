import uvicorn
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from src.server.dependencies import load_config
from src.server.app import app

def run_example_server():
    # Load the example config, which will be used by the get_agent dependency
    config_path = str(Path(__file__).parent / "config.yaml")
    config = load_config(config_path)

    # Get the port from the loaded config
    port = config.sdk.api.port

    print(f"Starting server with example agent configuration...")
    print(f"Agent Type: {config.agent.type}")
    print(f"Agent Name: {config.agent.config.get('name', 'N/A')}")
    print(f"Graph Definition: {config.agent.config.get('graph_definition')}")
    print(f"Open http://localhost:{port} in your browser.")
    
    uvicorn.run(app, host="0.0.0.0", port=port)

if __name__ == "__main__":
    run_example_server() 