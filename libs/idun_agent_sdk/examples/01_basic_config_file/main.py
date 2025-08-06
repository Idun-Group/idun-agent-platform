"""
Example 1: Basic Configuration File

This example demonstrates how to run an agent using a YAML configuration file.
This is the most common and recommended approach for production deployments.
"""

import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from src import create_app, run_server


def main():
    """Run the agent server using YAML configuration."""
    print("🔧 Starting Idun Agent SDK with YAML configuration...")
    
    # Path to our configuration file
    config_path = str(Path(__file__).parent / "config.yaml")
    
    # Create the FastAPI app with our configuration
    app = create_app(config_path=config_path)
    
    # Run the server with development settings
    run_server(app, reload=True)


if __name__ == "__main__":
    main() 