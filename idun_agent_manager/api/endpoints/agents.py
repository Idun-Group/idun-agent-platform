from typing import List
from fastapi import APIRouter, HTTPException, status, Body
from idun_agent_manager.models.agent_models import Agent
from idun_agent_manager.db import sqlite_db
from idun_agent_manager.services.agent_manager import agent_manager
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from idun_agent_manager.ag_ui.encoder.encoder import EventEncoder
import asyncio

class ChatRequest(BaseModel):
    session_id: str
    query: str

class ChatResponse(BaseModel):
    agent_id: str
    session_id: str
    response: str

router = APIRouter()

@router.post("/", response_model=Agent, status_code=status.HTTP_201_CREATED)
def create_agent(agent: Agent = Body(...)):
    """Create a new agent configuration and store it in the database."""
    try:
        return sqlite_db.create_agent_in_db(agent)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/", response_model=List[Agent])
def list_agents():
    """List all agent configurations from the database."""
    return sqlite_db.list_agents_from_db()

@router.get("/{agent_id}", response_model=Agent)
def get_agent(agent_id: str):
    """Retrieve a specific agent's configuration from the database."""
    agent = sqlite_db.get_agent_from_db(agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent

@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: str):
    """Delete an agent's configuration from the database and unload it from memory."""
    # Unload the agent from memory first to close any connections
    await agent_manager.unload_agent(agent_id)
    
    if not sqlite_db.delete_agent_from_db(agent_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found in database.")
    return

@router.post("/{agent_id}/chat", response_model=ChatResponse)
async def chat_with_agent(agent_id: str, request: ChatRequest):
    """
    Load an agent and process a chat message with it.
    This will load the agent into memory if it's not already active.
    """
    try:
        agent = await agent_manager.get_or_load_agent(agent_id)
        
        message = {"query": request.query, "session_id": request.session_id}
        response_content = await agent.process_message(message)
        
        return ChatResponse(
            agent_id=agent_id,
            session_id=request.session_id,
            response=response_content
        )
    except (ValueError, NotImplementedError) as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        # For other unexpected errors
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred: {e}")

@router.post("/{agent_id}/run")
async def run_agent(agent_id: str, request: ChatRequest):
    """
    Load an agent and process a message with it, streaming ag-ui events.
    """
    try:
        agent = await agent_manager.get_or_load_agent(agent_id)
        
        async def event_stream():
            encoder = EventEncoder()
            message = {"query": request.query, "session_id": request.session_id}
            async for event in agent.process_message_stream(message):
                yield encoder.encode(event)
                # Force the event loop to send the chunk now
                await asyncio.sleep(0.01)

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except (ValueError, NotImplementedError) as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        # For other unexpected errors
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred: {e}") 