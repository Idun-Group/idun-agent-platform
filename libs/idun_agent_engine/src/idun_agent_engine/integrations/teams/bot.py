"""Teams ActivityHandler that bridges messages to the agent over loopback HTTP."""

from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Any

import httpx
from botbuilder.core import ActivityHandler, TurnContext
from botbuilder.schema import Activity, ActivityTypes
from httpx_sse import aconnect_sse

from ._idempotency import SeenActivities

logger = logging.getLogger(__name__)


def _short_id(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:32]


class TeamsBot(ActivityHandler):
    def __init__(
        self,
        agent_url: str,
        http_client: httpx.AsyncClient,
        seen: SeenActivities,
    ) -> None:
        self._agent_url = agent_url.rstrip("/")
        self._http = http_client
        self._seen = seen

    async def on_message_activity(self, turn_context: TurnContext) -> None:
        activity = turn_context.activity
        text = (activity.text or "").strip()
        if not text:
            return
        if activity.id and self._seen.seen(activity.id):
            logger.info("teams.dup")
            return

        logger.info("teams.msg len=%d", len(text))
        thread_id = _short_id(activity.conversation.id)

        await turn_context.send_activity(Activity(type=ActivityTypes.typing))
        reply = await self._call_agent(thread_id, text)
        await turn_context.send_activity(reply or "(no response)")

    async def _call_agent(self, thread_id: str, text: str) -> str:
        payload: dict[str, Any] = {
            "threadId": thread_id,
            "runId": str(uuid.uuid4()),
            "state": {},
            "messages": [{"id": str(uuid.uuid4()), "role": "user", "content": text}],
            "tools": [],
            "context": [],
            "forwardedProps": {},
        }
        chunks: list[str] = []
        async with aconnect_sse(
            self._http,
            "POST",
            f"{self._agent_url}/agent/run",
            json=payload,
            timeout=httpx.Timeout(120.0, connect=5.0),
        ) as es:
            async for sse in es.aiter_sse():
                event = sse.json()
                ev_type = event.get("type")
                if ev_type == "TEXT_MESSAGE_CONTENT":
                    delta = event.get("delta") or ""
                    if delta:
                        chunks.append(delta)
                elif ev_type == "RUN_ERROR":
                    logger.warning("teams.run_error")
                    return event.get("message") or "Agent run failed."
        return "".join(chunks).strip()
