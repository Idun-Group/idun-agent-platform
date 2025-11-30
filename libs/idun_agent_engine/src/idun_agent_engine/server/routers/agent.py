"""Agent routes for invoking and streaming agent responses."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from idun_agent_schema.engine.api import ChatRequest, ChatResponse
from idun_agent_schema.engine.guardrails import Guardrail

from idun_agent_engine.agent.base import BaseAgent
from idun_agent_engine.server.dependencies import get_agent, get_copilotkit_agent
from idun_agent_engine.core.logging_config import get_logger, log_operation

from ag_ui.core.types import RunAgentInput
from ag_ui.encoder import EventEncoder
from copilotkit import LangGraphAGUIAgent
from ag_ui_adk import ADKAgent as ADKAGUIAgent

logger = get_logger("agent_router")
agent_router = APIRouter()


def _run_guardrails(
    guardrails: list[Guardrail], message: dict[str, str] | str, position: str
) -> tuple[str, str | None]:
    """Validates the request's message, by running it on given guardrails. If input is a dict -> input, else its an output guardrails."""
    text = message["query"] if isinstance(message, dict) else message
    for guard in guardrails:
        if guard.position == position and not guard.validate(text):
            return "blocked", guard.reject_message
    return "passed", None


@agent_router.get("/config")
async def get_config(request: Request):
    """Get the current agent configuration."""
    log_operation(logger, "DEBUG", "config_fetch_start", "Fetching agent configuration")

    if not hasattr(request.app.state, "engine_config"):
        log_operation(
            logger,
            "ERROR",
            "config_fetch_failed",
            "Engine config not available in app state",
            error_type="ConfigNotFound",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Configuration not available"
        )

    config = request.app.state.engine_config.agent
    engine_config = request.app.state.engine_config

    log_operation(
        logger,
        "INFO",
        "config_fetch_completed",
        "Agent configuration retrieved",
        agent_config=config.model_dump() if hasattr(config, "model_dump") else config,
    )

    return {"config": config}


@agent_router.post("/invoke", response_model=ChatResponse)
async def invoke(
    chat_request: ChatRequest,
    request: Request,
    agent: Annotated[BaseAgent, Depends(get_agent)],
):
    """Process a chat message with the agent without streaming."""
    message = {"query": chat_request.query, "session_id": chat_request.session_id}
    guardrails = getattr(request.app.state, "guardrails", [])

    agent_id = getattr(agent, "id", None)
    agent_type = getattr(agent, "agent_type", None)
    agent_name = getattr(agent, "name", None)
    agent_config = None
    if hasattr(agent, "configuration"):
        try:
            config = agent.configuration
            agent_config = (
                config.model_dump() if hasattr(config, "model_dump") else config
            )
        except:
            agent_config = None

    log_operation(
        logger,
        "INFO",
        "request_received",
        "Processing user request",
        agent_id=agent_id,
        agent_type=agent_type,
        agent_name=agent_name,
        agent_config=agent_config,
        session_id=message["session_id"],
        user_query=message["query"],
    )

    try:
        guardrail_input_result = "passed"
        guardrail_input_reason = None
        guardrail_output_result = None
        guardrail_output_reason = None

        if guardrails:
            guardrail_input_result, guardrail_input_reason = _run_guardrails(
                guardrails, message, position="input"
            )
            if guardrail_input_result == "blocked":
                log_operation(
                    logger,
                    "WARNING",
                    "request_blocked_input",
                    "Request blocked by input guardrails",
                    agent_id=agent_id,
                    agent_type=agent_type,
                    agent_name=agent_name,
                    session_id=message["session_id"],
                    user_query=message["query"],
                    guardrail_input_result=guardrail_input_result,
                    guardrail_input_reason=guardrail_input_reason,
                    guardrail_output_result=guardrail_output_result,
                    guardrail_output_reason=guardrail_output_reason,
                )
                raise HTTPException(status_code=429, detail=guardrail_input_reason)

        response_content = await agent.invoke(
            {"query": message["query"], "session_id": message["session_id"]}
        )

        if guardrails:
            guardrail_output_result, guardrail_output_reason = _run_guardrails(
                guardrails, response_content, position="output"
            )
            if guardrail_output_result == "blocked":
                log_operation(
                    logger,
                    "WARNING",
                    "response_blocked_output",
                    "Response blocked by output guardrails",
                    agent_id=agent_id,
                    agent_type=agent_type,
                    agent_name=agent_name,
                    session_id=message["session_id"],
                    user_query=message["query"],
                    agent_response=response_content,
                    guardrail_input_result=guardrail_input_result,
                    guardrail_input_reason=guardrail_input_reason,
                    guardrail_output_result=guardrail_output_result,
                    guardrail_output_reason=guardrail_output_reason,
                )
                raise HTTPException(status_code=429, detail=guardrail_output_reason)

        log_operation(
            logger,
            "INFO",
            "request_completed",
            "Request processed successfully",
            agent_id=agent_id,
            agent_type=agent_type,
            agent_name=agent_name,
            session_id=message["session_id"],
            user_query=message["query"],
            agent_response=response_content,
            guardrail_input_result=guardrail_input_result,
            guardrail_input_reason=guardrail_input_reason,
            guardrail_output_result=guardrail_output_result or "passed",
            guardrail_output_reason=guardrail_output_reason,
        )

        return ChatResponse(session_id=message["session_id"], response=response_content)
    except HTTPException:
        raise
    except Exception as e:
        log_operation(
            logger,
            "ERROR",
            "request_failed",
            "Request processing failed",
            agent_id=agent_id,
            agent_type=agent_type,
            agent_name=agent_name,
            session_id=message["session_id"],
            user_query=message["query"],
            error_type=type(e).__name__,
            error_details=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e)) from e


@agent_router.post("/stream")
async def stream(
    request: ChatRequest,
    agent: Annotated[BaseAgent, Depends(get_agent)],
):
    """Process a message with the agent, streaming ag-ui events."""
    message = {"query": request.query, "session_id": request.session_id}

    agent_id = getattr(agent, "id", None)
    agent_type = getattr(agent, "agent_type", None)
    agent_name = getattr(agent, "name", None)
    agent_config = None
    if hasattr(agent, "configuration"):
        try:
            config = agent.configuration
            agent_config = (
                config.model_dump() if hasattr(config, "model_dump") else config
            )
        except:
            agent_config = None

    log_operation(
        logger,
        "INFO",
        "stream_start",
        "Starting streaming response",
        agent_id=agent_id,
        agent_type=agent_type,
        agent_name=agent_name,
        agent_config=agent_config,
        session_id=message["session_id"],
        user_query=message["query"],
    )

    try:

        async def event_stream():
            async for event in agent.stream(message):
                yield f"data: {event.model_dump_json()}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except Exception as e:
        log_operation(
            logger,
            "ERROR",
            "stream_failed",
            "Streaming failed",
            agent_id=agent_id,
            agent_type=agent_type,
            agent_name=agent_name,
            session_id=message["session_id"],
            user_query=message["query"],
            error_type=type(e).__name__,
            error_details=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e)) from e


@agent_router.post("/copilotkit/stream")
async def copilotkit_stream(
    input_data: RunAgentInput,
    request: Request,
    copilotkit_agent: Annotated[
        LangGraphAGUIAgent | ADKAGUIAgent, Depends(get_copilotkit_agent)
    ],
):
    """Process a message with the agent, streaming ag-ui events."""
    if isinstance(copilotkit_agent, LangGraphAGUIAgent):
        try:
            # Get the accept header from the request
            accept_header = request.headers.get("accept")

            # Create an event encoder to properly format SSE events
            encoder = EventEncoder(accept=accept_header or "")  # type: ignore[arg-type]

            async def event_generator():
                async for event in copilotkit_agent.run(input_data):
                    yield encoder.encode(event)

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
            agent_id = request.url.path.lstrip("/")

            # Create an event encoder to properly format SSE events
            encoder = EventEncoder(accept=accept_header)

            async def event_generator():
                """Generate events from ADK agent."""
                try:
                    async for event in copilotkit_agent.run(input_data):
                        try:
                            encoded = encoder.encode(event)
                            logger.debug(f"HTTP Response: {encoded}")
                            yield encoded
                        except Exception as encoding_error:
                            log_operation(
                                logger,
                                "ERROR",
                                "event_encoding_error",
                                "Event encoding failed",
                                error_type=type(encoding_error).__name__,
                                error_details=str(encoding_error),
                            )
                            # Create a RunErrorEvent for encoding failures
                            from ag_ui.core import RunErrorEvent, EventType

                            error_event = RunErrorEvent(
                                type=EventType.RUN_ERROR,
                                message=f"Event encoding failed: {str(encoding_error)}",
                                code="ENCODING_ERROR",
                            )
                            try:
                                error_encoded = encoder.encode(error_event)
                                yield error_encoded
                            except Exception:
                                log_operation(
                                    logger,
                                    "ERROR",
                                    "error_event_encoding_failed",
                                    "Failed to encode error event, yielding basic SSE error",
                                )
                                yield 'event: error\ndata: {"error": "Event encoding failed"}\n\n'
                            break  # Stop the stream after an encoding error
                except Exception as agent_error:
                    # Handle errors from ADKAgent.run() itself
                    logger.error(f"❌ ADKAgent error: {agent_error}", exc_info=True)
                    # ADKAgent should have yielded a RunErrorEvent, but if something went wrong
                    # in the async generator itself, we need to handle it
                    try:
                        from ag_ui.core import RunErrorEvent, EventType

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
