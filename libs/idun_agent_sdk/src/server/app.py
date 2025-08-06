from fastapi import FastAPI
from src.server.routers import agent
from contextlib import asynccontextmanager
from src.server.dependencies import load_config
from src.agent_frameworks.langgraph_agent import LanggraphAgent

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load config and initialize agent on startup
    print("Server starting up...")
    app_config = load_config()
    agent_config_dict = app_config.agent.config
    agent_type = app_config.agent.type

    agent_instance = None
    if agent_type == "langgraph":
        agent_instance = LanggraphAgent()
    # Add other agent types here, e.g., elif agent_type == "adk": ...
    else:
        raise ValueError(f"Unknown or unsupported agent type: {agent_type}")
    
    await agent_instance.initialize(agent_config_dict)
    app.state.agent = agent_instance
    print("Agent initialized and stored in app state.")
    
    yield
    
    # Clean up on shutdown
    print("Server shutting down...")
    if hasattr(app.state.agent, "close") and callable(app.state.agent.close):
        await app.state.agent.close()
    print("Agent resources cleaned up.")


app = FastAPI(
    lifespan=lifespan,
    title="Idun Agent SDK Server",
    description="A server for running and interacting with agents.",
    version="0.1.0",
)

app.include_router(agent.router, prefix="/agent", tags=["Agent"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the Idun Agent SDK Server"} 