"""WhatsApp webhook endpoints — verification and message receive."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import PlainTextResponse
from idun_agent_schema.engine.integrations.whatsapp_webhook import (
    WhatsAppWebhookPayload,
)

from ...agent.base import BaseAgent
from .client import WhatsAppClient

logger = logging.getLogger(__name__)

router = APIRouter()


async def _handle_text_message(
    sender: str,
    text: str,
    agent: BaseAgent,
    client: WhatsAppClient,
) -> None:
    """Invoke the agent with the incoming text and send the reply back."""
    logger.info(f"Received message from {sender}: {text}")
    try:
        result = await agent.invoke({"query": text, "session_id": sender})
        reply = result if isinstance(result, str) else str(result)
        await client.send_text_message(to=sender, text=reply)
    except Exception:
        logger.exception(f"Error processing message from {sender}")


@router.get("/webhook")
async def verify_webhook(
    request: Request,
    hub_mode: str = Query(alias="hub.mode", default=""),
    hub_verify_token: str = Query(alias="hub.verify_token", default=""),
    hub_challenge: str = Query(alias="hub.challenge", default=""),
) -> Response:
    """Meta webhook verification — return the challenge if the token matches."""
    verify_token = getattr(request.app.state, "whatsapp_verify_token", None)
    if not verify_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WhatsApp integration not configured",
        )
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        logger.info("Webhook verification succeeded")
        return PlainTextResponse(hub_challenge)
    logger.warning(f"Webhook verification failed — mode={hub_mode}")
    return Response(status_code=403)


@router.post("/webhook")
async def receive_webhook(request: Request, payload: WhatsAppWebhookPayload) -> dict:
    """Receive an inbound message from WhatsApp and invoke the agent."""
    agent = getattr(request.app.state, "agent", None)
    client = getattr(request.app.state, "whatsapp_client", None)
    if not agent or not client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WhatsApp integration not ready",
        )

    logger.debug(f"Received webhook payload with {len(payload.entry)} entries")

    for entry in payload.entry:
        for change in entry.changes:
            if not change.value.messages:
                continue
            for message in change.value.messages:
                if message.type != "text" or not message.text:
                    logger.debug(f"Skipping non-text message type: {message.type}")
                    continue
                await _handle_text_message(
                    sender=message.sender,
                    text=message.text.body,
                    agent=agent,
                    client=client,
                )

    return {"status": "ok"}
