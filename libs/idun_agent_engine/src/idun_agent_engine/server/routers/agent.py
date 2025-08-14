"""Agent routes for invoking and streaming agent responses."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from idun_agent_engine.agent.base import BaseAgent
from idun_agent_engine.server.dependencies import get_agent


class ChatRequest(BaseModel):
    """Chat request payload for agent endpoints."""

    session_id: str
    query: str


class ChatResponse(BaseModel):
    """Chat response payload containing session and response text."""

    session_id: str
    response: str


agent_router = APIRouter()


@agent_router.post("/invoke", response_model=ChatResponse)
async def invoke(
    request: ChatRequest,
    agent: Annotated[BaseAgent, Depends(get_agent)],
):
    """Process a chat message with the agent without streaming."""
    try:
        message = {"query": request.query, "session_id": request.session_id}
        response_content = await agent.invoke(message)

        return ChatResponse(session_id=request.session_id, response=response_content)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@agent_router.post("/stream")
async def stream(
    request: ChatRequest,
    agent: Annotated[BaseAgent, Depends(get_agent)],
):
    """Process a message with the agent, streaming ag-ui events."""
    try:

        async def event_stream():
            message = {"query": request.query, "session_id": request.session_id}
            async for event in agent.stream(message):
                yield f"data: {event.model_dump_json()}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e
