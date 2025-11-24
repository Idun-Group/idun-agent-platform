"""Agent routes for invoking and streaming agent responses."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from idun_agent_schema.engine.api import ChatRequest, ChatResponse
from idun_agent_schema.engine.guardrails import Guardrail

from idun_agent_engine.agent.base import BaseAgent
from idun_agent_engine.server.dependencies import get_agent, get_copilotkit_agent

from ag_ui.core.types import RunAgentInput
from ag_ui.encoder import EventEncoder
from copilotkit import LangGraphAGUIAgent

logging.basicConfig(
    format="%(asctime)s %(levelname)-8s %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)
agent_router = APIRouter()


def _run_guardrails(
    guardrails: list[Guardrail], message: dict[str, str] | str, position: str
) -> None:
    """Validates the request's message, by running it on given guardrails. If input is a dict -> input, else its an output guardrails."""
    for guard in guardrails:
        if guard.position == position:
            if not guard.validate(
                message["query"] if isinstance(message, dict) else message
            ):
                raise HTTPException(status_code=429, detail=guard.reject_message)
        else:
            pass
    return


@agent_router.get("/config")
async def get_config(request: Request):
    """Get the current agent configuration."""
    logger.debug("Fetching agent config..")
    if not hasattr(request.app.state, "engine_config"):
        logger.error("Error retrieving the engine config from the api. ")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Configuration not available"
        )

    config = request.app.state.engine_config.agent
    logger.info(f"Fetched config for agent: {request.app.state.engine_config}")
    return {"config": config}


@agent_router.post("/invoke", response_model=ChatResponse)
async def invoke(
    chat_request: ChatRequest,
    request: Request,
    agent: Annotated[BaseAgent, Depends(get_agent)],
):
    """Process a chat message with the agent without streaming."""
    try:
        message = {"query": chat_request.query, "session_id": chat_request.session_id}
        guardrails = getattr(request.app.state, 'guardrails', [])
        if guardrails:
            _run_guardrails(guardrails, message, position="input")
        response_content = await agent.invoke(
            {"query": message["query"], "session_id": message["session_id"]}
        )
        if guardrails:
            _run_guardrails(guardrails, response_content, position="output")
        return ChatResponse(session_id=message["session_id"], response=response_content)
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

@agent_router.post("/copilotkit/stream")
async def copilotkit_stream(
    input_data: RunAgentInput,
    request: Request,
    copilotkit_agent: Annotated[LangGraphAGUIAgent, Depends(get_copilotkit_agent)],
):
    """Process a message with the agent, streaming ag-ui events."""
    try:
        # Get the accept header from the request
        accept_header = request.headers.get("accept")

        # Create an event encoder to properly format SSE events
        encoder = EventEncoder(accept=accept_header or "") # type: ignore[arg-type]

        async def event_generator():
            async for event in copilotkit_agent.run(input_data):
                yield encoder.encode(event)

        return StreamingResponse(
            event_generator(),  # type: ignore[arg-type]
            media_type=encoder.get_content_type()
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e
