from fastapi import FastAPI
from idun_agent_manager.api import agent_router

app = FastAPI(
    title="Idun Agent Manager",
    description="A unified orchestration and observability layer for LLM agent frameworks.",
    version="0.1.0",
)

app.include_router(agent_router.router)

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}

# To run this application (from the project root directory):
# poetry run uvicorn idun_agent_manager.main:app --reload 