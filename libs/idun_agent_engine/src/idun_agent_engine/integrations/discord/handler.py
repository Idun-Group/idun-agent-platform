"""Discord Interactions Endpoint webhook handler."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request, Response
from idun_agent_schema.engine.integrations.discord_webhook import (
    DiscordInteraction,
    InteractionResponseType,
    InteractionType,
)

from ...agent.base import BaseAgent
from .client import DiscordClient
from .verify import verify_discord_signature

logger = logging.getLogger(__name__)

router = APIRouter()

DISCORD_MAX_MESSAGE_LENGTH = 2000


async def _handle_application_command(
    interaction: DiscordInteraction,
    agent: BaseAgent,
    client: DiscordClient,
) -> None:
    """Invoke the agent with the command text and edit the deferred response."""
    session_id = interaction.resolve_user_id()
    text = interaction.extract_command_text()

    logger.debug(f"Discord command from user {session_id}: {text}")

    try:
        result = await agent.invoke({"query": text, "session_id": session_id})
        reply = result if isinstance(result, str) else str(result)

        if len(reply) > DISCORD_MAX_MESSAGE_LENGTH:
            reply = reply[: DISCORD_MAX_MESSAGE_LENGTH - 3] + "…"

        await client.edit_interaction_response(interaction.token, reply)
    except Exception:
        logger.exception(f"Error processing Discord command from {session_id}")
        try:
            await client.edit_interaction_response(
                interaction.token, "Sorry, something went wrong."
            )
        except Exception:
            logger.exception("Failed to send error response to Discord")


def _json_response(data: dict, status_code: int = 200) -> Response:
    return Response(
        content=json.dumps(data),
        media_type="application/json",
        status_code=status_code,
    )


@router.post("/webhook")
async def discord_webhook(request: Request) -> Response:
    """Receive and handle a Discord interaction."""
    public_key: str | None = getattr(request.app.state, "discord_public_key", None)
    if not public_key:
        return Response(status_code=503, content="Discord integration not configured")

    signature = request.headers.get("X-Signature-Ed25519", "")
    timestamp = request.headers.get("X-Signature-Timestamp", "")
    body = await request.body()

    if not verify_discord_signature(public_key, signature, timestamp, body):
        return Response(status_code=401, content="Invalid request signature")

    interaction = DiscordInteraction.model_validate_json(body)

    if interaction.type == InteractionType.PING:
        logger.info("Discord PING received")
        return _json_response({"type": InteractionResponseType.PONG})

    if interaction.type == InteractionType.APPLICATION_COMMAND:
        agent: BaseAgent | None = getattr(request.app.state, "agent", None)
        client: DiscordClient | None = getattr(
            request.app.state, "discord_client", None
        )
        if not agent or not client:
            return Response(status_code=503, content="Discord integration not ready")

        asyncio.create_task(_handle_application_command(interaction, agent, client))
        return _json_response(
            {"type": InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE}
        )

    logger.warning(f"Unhandled Discord interaction type {interaction.type}")
    return Response(status_code=200)
