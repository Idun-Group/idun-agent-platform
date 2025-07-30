from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from idun_agent_manager.models.agent_models import Agent, AgentRead, AgentCreate, AgentConfig
from idun_agent_manager.db import sqlite_db
from idun_agent_manager.services.agent_manager import agent_manager
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from ag_ui.core.event_encoder import EventEncoder
import asyncio
import json
import tempfile
import zipfile
import shutil
import os
import sys

class ChatRequest(BaseModel):
    session_id: str
    query: str

class ChatResponse(BaseModel):
    agent_id: str
    session_id: str
    response: str

router = APIRouter()

@router.post("/", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(
    name: str = Form(...),
    description: str = Form(...),
    framework_type: str = Form(...),
    config: str = Form(...), # JSON string for config
    agent_path: Optional[str] = Form(None),
    agent_variable: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """
    Creates a new agent.
    This endpoint supports two methods for specifying the agent's code:
    1.  **From Path:** Provide `agent_path` (e.g., `tests/example_agents/simple_graph.py`) and
        `agent_variable` (e.g., `graph_builder`) in the form data. The files must exist on the backend.
    2.  **From File Upload:** Provide a `.zip` `file` containing the agent's code. You must also
        provide `agent_path` (the relative path to the main file within the zip) and `agent_variable`.
    """
    try:
        config_dict = json.loads(config)

        # This logic handles creating a temporary directory for uploaded agents
        # and adjusting the agent_path to be loadable by importlib.
        temp_dir_to_manage = None

        if file:
            if not agent_variable or not agent_path:
                raise HTTPException(status_code=400, detail="With a file upload, 'agent_variable' and 'agent_path' (main file in zip) are required.")
            
            temp_dir = tempfile.mkdtemp(prefix="agent_upload_")
            temp_dir_to_manage = temp_dir # Mark for potential cleanup later
            
            try:
                zip_path = os.path.join(temp_dir, file.filename)
                with open(zip_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)

                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
                
                if temp_dir not in sys.path:
                    sys.path.insert(0, temp_dir)

                # The agent_path from the form now points to a file inside the temp dir
                full_agent_path = os.path.join(temp_dir, agent_path)
                final_agent_path_str = f"{full_agent_path}:{agent_variable}"
                config_dict["agent_path"] = final_agent_path_str

            except Exception as e:
                if temp_dir_to_manage:
                    shutil.rmtree(temp_dir_to_manage)
                raise HTTPException(status_code=500, detail=f"Failed to process uploaded file: {e}")

        elif agent_path and agent_variable:
            # Path-based method, no file uploaded.
            config_dict["agent_path"] = f"{agent_path}:{agent_variable}"
        else:
            # If not using file upload, both path and variable are required.
            # Smol/ADK agents might not need a path, so we check the framework type.
            if framework_type in ["langgraph"]:
                 raise HTTPException(status_code=400, detail="'agent_path' and 'agent_variable' are required for this framework type when not uploading a file.")


        agent_create_data = {
            "name": name,
            "description": description,
            "framework_type": framework_type,
            "config": config_dict,
            "agent_path": agent_path, # Store the original relative path
            "agent_variable": agent_variable
        }
        agent_create = AgentCreate(**agent_create_data)
        
        agent_model = sqlite_db.add_agent_to_db(agent_create)
        
        # NOTE: Temporary directory cleanup is a complex issue. If the agent is loaded
        # into memory, the temp directory must persist for the lifetime of the process.
        # A more robust solution might involve a scheduled cleanup task for orphaned
        # agent directories. For now, we leave it.

        return AgentRead.from_orm(agent_model)

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for 'config' field.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if 'temp_dir_to_manage' in locals() and temp_dir_to_manage:
             shutil.rmtree(temp_dir_to_manage)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")


@router.get("/", response_model=List[AgentRead])
def list_agents():
    """List all agent configurations from the database."""
    agents_db = sqlite_db.list_agents_from_db()
    return [AgentRead.from_orm(agent) for agent in agents_db]


@router.get("/{agent_id}", response_model=AgentRead)
def get_agent(agent_id: str):
    """Retrieve a specific agent's configuration from the database."""
    agent_db = sqlite_db.get_agent_from_db(agent_id)
    if not agent_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return AgentRead.from_orm(agent_db)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: str):
    """Delete an agent's configuration from the database and unload it from memory."""
    # Unload the agent from memory first to close any connections
    await agent_manager.unload_agent(agent_id)
    
    if not sqlite_db.delete_agent_from_db(agent_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found in database.")
    return


@router.post("/{agent_id}/chat", response_model=ChatResponse)
async def run_agent_no_stream(agent_id: str, request: ChatRequest):
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
                await asyncio.sleep(0.01)

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except (ValueError, NotImplementedError) as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        # For other unexpected errors
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred: {e}") 