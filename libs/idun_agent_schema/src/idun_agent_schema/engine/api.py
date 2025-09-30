"""Schemas for engine HTTP API request/response payloads."""

from pydantic import BaseModel


class ChatRequest(BaseModel):
    """Request payload for synchronous and streaming chat endpoints.

    Attributes:
        session_id: Client-provided session identifier for routing state.
        query: Natural language prompt or input for the agent.

    """

    session_id: str
    query: str


class ChatResponse(BaseModel):
    """Response payload for chat endpoints.

    Attributes:
        session_id: Echoed session identifier.
        response: Agent's textual response.

    """

    session_id: str
    response: str
