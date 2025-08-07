from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
from src.server.dependencies import get_agent
from src.agent_frameworks.base_agent import BaseAgent

class ChatRequest(BaseModel):
    session_id: str
    query: str

class ChatResponse(BaseModel):
    agent_id: str
    session_id: str
    response: str

agent_router = APIRouter()

@agent_router.post("/invoke", response_model=ChatResponse)
async def invoke(request: ChatRequest, agent: BaseAgent = Depends(get_agent)):
    """
    Process a chat message with the agent without streaming.
    """
    try:
        message = {"query": request.query, "session_id": request.session_id}
        response_content = await agent.invoke(message)
        
        return ChatResponse(
            agent_id=agent.id,
            session_id=request.session_id,
            response=response_content
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@agent_router.post("/stream")
async def stream(request: ChatRequest, agent: BaseAgent = Depends(get_agent)):
    """
    Process a message with the agent, streaming ag-ui events.
    """
    try:
        async def event_stream():
            message = {"query": request.query, "session_id": request.session_id}
            async for event in agent.stream(message):
                yield f"data: {event.model_dump_json()}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
