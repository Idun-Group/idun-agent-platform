"""Slack Events API webhook handler."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response
from fastapi.responses import PlainTextResponse
from idun_agent_schema.engine.integrations.slack_webhook import SlackEventPayload

from ...agent.base import BaseAgent
from ..utils import extract_text_content
from .client import SlackClient
from .verify import verify_slack_signature

logger = logging.getLogger(__name__)

router = APIRouter()


async def _handle_message(
    user: str,
    channel: str,
    text: str,
    agent: BaseAgent,
    client: SlackClient,
) -> None:
    """Invoke the agent and send the reply to the channel."""
    logger.info("Received Slack message from %s in %s: %s", user, channel, text)
    try:
        result = await agent.invoke({"query": text, "session_id": user})
        reply = extract_text_content(result)
        await client.send_message(channel=channel, text=reply)
        logger.info("Reply sent to %s in channel %s", user, channel)
    except Exception as e:
        logger.exception("Error processing Slack message from %s: %s", user, e)


@router.post("/webhook")
async def slack_webhook(request: Request) -> Response:
    """Receive and handle a Slack event."""
    body = await request.body()
    body_str = body.decode("utf-8")

    payload = SlackEventPayload.model_validate_json(body)

    if payload.type == "url_verification":
        logger.info("Slack url_verification challenge received")
        return PlainTextResponse(payload.challenge or "")

    signing_secret: str | None = getattr(
        request.app.state, "slack_signing_secret", None
    )
    if not signing_secret:
        logger.warning("Slack webhook received but signing secret not configured")
        return Response(status_code=503, content="Slack integration not configured")

    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not verify_slack_signature(signing_secret, timestamp, signature, body_str):
        logger.warning("Slack signature verification failed")
        return Response(status_code=401, content="Invalid request signature")

    if payload.type != "event_callback" or not payload.event:
        logger.warning("Ignoring Slack event type: %s", payload.type)
        return Response(status_code=200)

    event = payload.event

    if event.type != "message" or event.bot_id:
        logger.warning("Skipping non-user message event (type=%s, bot_id=%s)", event.type, event.bot_id)
        return Response(status_code=200)

    agent: BaseAgent | None = getattr(request.app.state, "agent", None)
    client: SlackClient | None = getattr(request.app.state, "slack_client", None)
    if not agent or not client:
        logger.error("Slack webhook received but agent or client not initialized")
        return Response(status_code=503, content="Slack integration not ready")

    await _handle_message(event.user, event.channel, event.text, agent, client)

    return Response(status_code=200)
