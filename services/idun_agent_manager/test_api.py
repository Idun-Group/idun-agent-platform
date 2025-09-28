#!/usr/bin/env python3
"""
Simple test script to run our FastAPI app locally.
This bypasses all the container complexity and just tests the API endpoints.
"""

import os
import sys

import uvicorn

# Add the src directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from app.main import app

if __name__ == "__main__":
    print("🚀 Starting Idun Agent Manager API on http://localhost:8000")
    print("📖 API docs available at http://localhost:8000/docs")
    print("🔥 Simplified version - no database, using in-memory storage")
    print()

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True, log_level="info")
