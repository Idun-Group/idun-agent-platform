"""Example 1: Basic configuration file runner."""

from pathlib import Path

from dotenv import load_dotenv

from idun_agent_engine.core.app_factory import create_app
from idun_agent_engine.core.server_runner import run_server

load_dotenv()

import os
# os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"
# os.environ["GOOGLE_CLOUD_PROJECT"] = "chat-appsheet-prd"
# os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"  # e.g., us-central1

# Path to our configuration file
config_path = str(Path(__file__).parent / "config.yaml")

# Create the FastAPI app with our configuration
# This is available at module level for uvicorn to import
app = create_app(config_path=config_path)

if __name__ == "__main__":
    """Run the agent server using YAML configuration."""
    print("🔧 Starting Idun Agent Engine with YAML configuration...")
    run_server(app)
