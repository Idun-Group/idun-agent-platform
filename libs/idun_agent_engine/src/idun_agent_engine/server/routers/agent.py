"""Agent routes for invoking and streaming agent responses."""

import logging
import time
from typing import Annotated, Any

from ag_ui.core.types import RunAgentInput
from ag_ui.encoder import EventEncoder
from ag_ui_adk import ADKAgent as ADKAGUIAgent
from copilotkit import LangGraphAGUIAgent
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from idun_agent_schema.engine.api import ChatRequest, ChatResponse
from idun_agent_schema.engine.capabilities import AgentCapabilities
from idun_agent_schema.engine.guardrails import Guardrail
from pydantic import BaseModel

from idun_agent_engine.agent.base import BaseAgent
from idun_agent_engine.agent.observers import RunContext
from idun_agent_engine.server.auth import get_verified_user
from idun_agent_engine.server.dependencies import (
    get_agent,
    get_capabilities,
    get_copilotkit_agent,
)

logger = logging.getLogger(__name__)
agent_router = APIRouter()


def _extract_text_values(data: Any) -> list[str]:
    """Extract all non-empty string values from structured input."""
    if isinstance(data, str):
        return [data] if data.strip() else []
    if isinstance(data, dict):
        return [t for v in data.values() for t in _extract_text_values(v)]
    if isinstance(data, list):
        return [t for item in data for t in _extract_text_values(item)]
    return []


def _guardrail_text_from_state(state: dict) -> str:
    """Join all text values from structured state into a single string for validation."""
    texts = _extract_text_values(state)
    return "\n".join(texts)


def _guardrail_input_from(input_data: RunAgentInput) -> str | None:
    """Return the text payload to validate: last message content, or state text."""
    if input_data.messages:
        content = input_data.messages[-1].content
        if content is not None:
            return content if isinstance(content, str) else str(content)
    if input_data.state:
        return _guardrail_text_from_state(input_data.state)
    return None


def _run_guardrails(
    guardrails: list[Guardrail], text: str, position: str
) -> None:
    """Validate text against guardrails matching the given position."""
    for guard in guardrails:
        if guard.position != position:  # type: ignore[attr-defined]
            continue
        if not guard.validate(text):  # type: ignore[attr-defined]
            raise HTTPException(status_code=429, detail=guard.reject_message)  # type: ignore[attr-defined]


@agent_router.get("/capabilities")
async def capabilities(
    caps: Annotated[AgentCapabilities, Depends(get_capabilities)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
):
    """Return the agent's capability descriptor for UI auto-configuration."""
    return caps


@agent_router.post("/run")
async def run(
    input_data: RunAgentInput,
    request: Request,
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
):
    """Canonical AG-UI interaction endpoint.

    Accepts RunAgentInput, returns SSE stream of AG-UI events.
    """
    last_msg = input_data.messages[-1] if input_data.messages else None
    last_content = str(last_msg.content)[:120] if last_msg else "<empty>"
    logger.info(f"Run — thread_id={input_data.thread_id}, message={last_content}")

    guardrails = getattr(request.app.state, "guardrails", [])
    if guardrails:
        guardrail_input = _guardrail_input_from(input_data)
        if guardrail_input is not None:
            _run_guardrails(guardrails, text=guardrail_input, position="input")

    accept_header = request.headers.get("accept")
    encoder = EventEncoder(accept=accept_header or "")

    async def event_generator():
        try:
            async for event in agent.run(input_data):
                await agent.run_event_observers.dispatch(
                    event,
                    RunContext(
                        thread_id=input_data.thread_id,
                        run_id=input_data.run_id,
                    ),
                )
                try:
                    yield encoder.encode(event)
                except Exception as encoding_error:
                    logger.error(
                        f"Event encoding error: {encoding_error}", exc_info=True
                    )
                    from ag_ui.core import EventType, RunErrorEvent

                    error_event = RunErrorEvent(
                        type=EventType.RUN_ERROR,
                        message=f"Event encoding failed: {encoding_error}",
                        code="ENCODING_ERROR",
                    )
                    try:
                        yield encoder.encode(error_event)
                    except Exception:
                        yield 'event: error\ndata: {"error": "Event encoding failed"}\n\n'
                    break
        except Exception as agent_error:
            logger.error(f"Agent run error: {agent_error}", exc_info=True)
            from ag_ui.core import EventType, RunErrorEvent

            error_event = RunErrorEvent(
                type=EventType.RUN_ERROR,
                message=f"Agent execution failed: {agent_error}",
                code="FRAMEWORK_ERROR",
            )
            try:
                yield encoder.encode(error_event)
            except Exception:
                yield 'event: error\ndata: {"error": "Agent execution failed"}\n\n'

    return StreamingResponse(event_generator(), media_type=encoder.get_content_type())


@agent_router.get("/graph")
async def get_graph(
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
):
    """Return the Mermaid diagram of the compiled LangGraph agent."""
    from langgraph.graph.state import CompiledStateGraph

    instance = getattr(agent, "_agent_instance", None)
    if not isinstance(instance, CompiledStateGraph):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Graph visualization is only available for LangGraph agents",
        )

    return {"graph": instance.get_graph().draw_mermaid()}


@agent_router.get("/config")
async def get_config(request: Request):
    """Get the current agent configuration."""
    if not hasattr(request.app.state, "engine_config"):
        logger.error("Engine config not available on app state")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Configuration not available"
        )

    config = request.app.state.engine_config.agent
    logger.debug(
        f"Returning config for agent '{config.config.name}' (type={config.type})"
    )
    return {"config": config}


# TODO: DEPRECATED — remove when /agent/run migration is complete
@agent_router.post("/stream", deprecated=True)
async def stream(
    request: ChatRequest,
    agent: Annotated[BaseAgent, Depends(get_agent)],
    _user: Annotated[dict | None, Depends(get_verified_user)],
):
    """Process a message with the agent, streaming ag-ui events."""
    query_preview = request.query[:120] + ("..." if len(request.query) > 120 else "")
    logger.info(
        f"Stream request — session_id={request.session_id}, query={query_preview}"
    )
    try:

        async def event_stream():
            message = {"query": request.query, "session_id": request.session_id}
            async for event in agent.stream(message):
                yield f"data: {event.model_dump_json()}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except Exception as e:  # noqa: BLE001
        logger.error(
            f"Stream failed — session_id={request.session_id}, error={e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(e)) from e


# TODO: DEPRECATED — remove when /agent/run migration is complete
@agent_router.post("/copilotkit/stream", deprecated=True)
async def copilotkit_stream(
    input_data: RunAgentInput,
    request: Request,
    copilotkit_agent: Annotated[
        LangGraphAGUIAgent | ADKAGUIAgent, Depends(get_copilotkit_agent)
    ],
    _user: Annotated[dict | None, Depends(get_verified_user)],
):
    """Process a message with the agent, streaming ag-ui events."""
    last_msg = input_data.messages[-1] if input_data.messages else None
    last_content = str(last_msg.content)[:120] if last_msg else "<empty>"
    logger.info(
        f"CopilotKit stream — session_id={input_data.thread_id}, "
        f"message={last_content}{'...' if last_msg and len(str(last_msg.content)) > 120 else ''}"
    )
    logger.debug(
        f"CopilotKit details — agent={type(copilotkit_agent).__name__}, "
        f"thread_id={input_data.thread_id}, messages_count={len(input_data.messages)}"
    )

    guardrails = getattr(request.app.state, "guardrails", [])
    if guardrails:
        logger.debug(f"Running {len(guardrails)} input guardrails")
        _run_guardrails(
            guardrails, text=str(input_data.messages[-1].content), position="input"
        )
    if isinstance(copilotkit_agent, LangGraphAGUIAgent):
        try:
            # Get the accept header from the request
            accept_header = request.headers.get("accept")

            # Create an event encoder to properly format SSE events
            encoder = EventEncoder(accept=accept_header or "")  # type: ignore[arg-type]

            async def event_generator():
                async for event in copilotkit_agent.run(input_data):
                    yield encoder.encode(event)  # type: ignore[arg-type]

            return StreamingResponse(
                event_generator(),  # type: ignore[arg-type]
                media_type=encoder.get_content_type(),
            )
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(e)) from e
    elif isinstance(copilotkit_agent, ADKAGUIAgent):
        try:
            # Get the accept header from the request
            accept_header = request.headers.get("accept")

            # Create an event encoder to properly format SSE events
            encoder = EventEncoder(accept=accept_header or "")

            async def event_generator():
                """Generate events from ADK agent."""
                try:
                    async for event in copilotkit_agent.run(input_data):
                        try:
                            encoded = encoder.encode(event)
                            logger.debug(f"HTTP Response: {encoded}")
                            yield encoded
                        except Exception as encoding_error:
                            # Handle encoding-specific errors
                            logger.error(
                                f"❌ Event encoding error: {encoding_error}",
                                exc_info=True,
                            )
                            # Create a RunErrorEvent for encoding failures
                            from ag_ui.core import EventType, RunErrorEvent

                            error_event = RunErrorEvent(
                                type=EventType.RUN_ERROR,
                                message=f"Event encoding failed: {str(encoding_error)}",
                                code="ENCODING_ERROR",
                            )
                            try:
                                error_encoded = encoder.encode(error_event)
                                yield error_encoded
                            except Exception:
                                # If we can't even encode the error event, yield a basic SSE error
                                logger.error(
                                    "Failed to encode error event, yielding basic SSE error"
                                )
                                yield 'event: error\ndata: {"error": "Event encoding failed"}\n\n'
                            break  # Stop the stream after an encoding error
                except Exception as agent_error:
                    # Handle errors from ADKAgent.run() itself
                    logger.error(f"❌ ADKAgent error: {agent_error}", exc_info=True)
                    # ADKAgent should have yielded a RunErrorEvent, but if something went wrong
                    # in the async generator itself, we need to handle it
                    try:
                        from ag_ui.core import EventType, RunErrorEvent

                        error_event = RunErrorEvent(
                            type=EventType.RUN_ERROR,
                            message=f"Agent execution failed: {str(agent_error)}",
                            code="AGENT_ERROR",
                        )
                        error_encoded = encoder.encode(error_event)
                        yield error_encoded
                    except Exception:
                        # If we can't encode the error event, yield a basic SSE error
                        logger.error(
                            "Failed to encode agent error event, yielding basic SSE error"
                        )
                        yield 'event: error\ndata: {"error": "Agent execution failed"}\n\n'

            return StreamingResponse(
                event_generator(), media_type=encoder.get_content_type()
            )
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(e)) from e
    else:
        raise HTTPException(status_code=400, detail="Invalid agent type")


def register_invoke_route(app: FastAPI, input_model: type[BaseModel]) -> None:
    """Register the /invoke route dynamically with the given input model.

    TODO: DEPRECATED — input_model is always ChatRequest now.
    Remove when /agent/invoke shim is fully removed.
    """

    async def invoke(
        request: Request,
        input_data: input_model,  # type: ignore[valid-type]
        agent: Annotated[BaseAgent, Depends(get_agent)],
        _user: Annotated[dict | None, Depends(get_verified_user)],
    ) -> ChatResponse:
        """Invoke the agent with a message and get a response."""
        guardrails = getattr(request.app.state, "guardrails", [])
        if guardrails:
            _run_guardrails(
                guardrails, text=input_data.query, position="input"
            )

        try:
            query = input_data.query[:120]
            logger.info(f"Invoke session={input_data.session_id} query={query}")
            message = {
                "query": input_data.query,
                "session_id": input_data.session_id,
            }
            try:
                start = time.monotonic()
                response = await agent.invoke(message)
                logger.info(
                    f"Invoke session={input_data.session_id} completed in {time.monotonic() - start:.2f}s response={str(response)[:200]}"
                )
                return ChatResponse(session_id=input_data.session_id, response=response)
            except Exception as e:
                logger.error(
                    f"Invoke session={input_data.session_id} failed: {e}", exc_info=True
                )
                raise HTTPException(
                    status_code=400,
                    detail="Make sure your input schema is {'query': 'your input', 'session_id': 'your-session-id'",
                ) from e
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            logger.error(f"Invoke failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e)) from e

    # TODO: DEPRECATED — remove when /agent/run migration is complete
    app.add_api_route(
        "/agent/invoke",
        invoke,
        methods=["POST"],
        response_model=ChatResponse,
        tags=["Agent"],
        deprecated=True,
    )
