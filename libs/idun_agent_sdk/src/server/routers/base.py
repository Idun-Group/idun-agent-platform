# Add a health check endpoint
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from src.__init__ import __version__

base_router = APIRouter()

@base_router.get("/health")
def health_check():
    """Health check endpoint for monitoring and load balancers."""
    return {"status": "healthy", "sdk_version": __version__}

# Add a root endpoint with helpful information
@base_router.get("/")
def read_root():
    """Root endpoint with basic information about the service."""
    return {
        "message": "Welcome to your Idun Agent SDK server!",
        "docs": "/docs",
        "health": "/health",
        "agent_endpoints": {
            "invoke": "/agent/invoke",
            "stream": "/agent/stream"
        }
    }