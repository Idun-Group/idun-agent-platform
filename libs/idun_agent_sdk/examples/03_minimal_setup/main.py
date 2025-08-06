"""
Example 3: Minimal Setup

This is the absolute minimal way to run an agent with the Idun Agent SDK.
Perfect for prototyping, demos, and getting started quickly.
"""

import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# That's it! Just one function call to run your agent server
from src.core.server_runner import run_server_from_config

if __name__ == "__main__":
    print("🚀 Starting minimal agent server...")
    print("📖 This demonstrates the simplest possible setup!")
    
    # One line to rule them all!
    run_server_from_config("config.yaml", reload=True) 