"""Google Chat interaction event webhook handler."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response
from idun_agent_schema.engine.integrations.google_chat_webhook import (
    GoogleChatEventPayload,
)

from ...agent.base import BaseAgent
from ..utils import extract_text_content
from .client import GoogleChatClient
from .verify import verify_google_chat_token

logger = logging.getLogger(__name__)

router = APIRouter()


async def _handle_message(
    user_name: str,
    space_name: str,
    text: str,
    agent: BaseAgent,
    client: GoogleChatClient,
) -> None:
    """Invoke the agent and send the reply to the space."""
    try:
        result = await agent.invoke({"query": text, "session_id": user_name})
        reply = extract_text_content(result)
        await client.send_message(space_name=space_name, text=reply)
    except Exception as e:
        logger.exception(
            "Error processing Google Chat message from %s: %s", user_name, e
        )


@router.post("/webhook")
async def google_chat_webhook(request: Request) -> Response:
    """Receive and handle a Google Chat interaction event."""
    body = await request.body()
    payload = GoogleChatEventPayload.model_validate_json(body)

    project_number: str | None = getattr(
        request.app.state, "google_chat_project_number", None
    )
    if not project_number:
        logger.warning(
            "Google Chat webhook received but project number not configured"
        )
        return Response(
            status_code=503, content="Google Chat integration not configured"
        )

    auth_header = request.headers.get("Authorization", "")
    bearer_token = auth_header.removeprefix("Bearer ").strip()
    local_mode: bool = getattr(
        request.app.state, "google_chat_local_mode", False
    )
    if not bearer_token or not verify_google_chat_token(
        bearer_token,
        project_number,
        webhook_url=str(request.url),
        local_mode=local_mode,
    ):
        logger.warning("Google Chat JWT verification failed")
        return Response(status_code=401, content="Invalid request token")

    if payload.type == "ADDED_TO_SPACE":
        space_display = payload.space.display_name if payload.space else "unknown"
        logger.info("Google Chat app added to space '%s'", space_display)
        return Response(status_code=200)

    if payload.type != "MESSAGE" or not payload.message:
        logger.warning("Ignoring Google Chat event type: %s", payload.type)
        return Response(status_code=200)

    message = payload.message

    if message.sender and message.sender.type == "BOT":
        return Response(status_code=200)

    agent: BaseAgent | None = getattr(request.app.state, "agent", None)
    client: GoogleChatClient | None = getattr(
        request.app.state, "google_chat_client", None
    )
    if not agent or not client:
        logger.error(
            "Google Chat webhook received but agent or client not initialized"
        )
        return Response(
            status_code=503, content="Google Chat integration not ready"
        )

    # Use argumentText (text without the @mention) if available, fallback to text
    text = message.argument_text.strip() if message.argument_text else message.text
    space_name = message.space.name if message.space else ""
    space_display = message.space.display_name if message.space else space_name
    user_display = message.sender.display_name if message.sender else "unknown"
    user_name = message.sender.name if message.sender else "unknown"

    logger.info(
        "'%s' in '%s': %s",
        user_display,
        space_display or space_name,
        text,
    )

    if not space_name:
        logger.warning("Google Chat message missing space name, skipping")
        return Response(status_code=200)

    await _handle_message(user_name, space_name, text, agent, client)

    return Response(status_code=200)
