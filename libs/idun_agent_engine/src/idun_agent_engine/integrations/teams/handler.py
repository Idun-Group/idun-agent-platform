"""Teams messaging endpoint — receives Bot Framework activities."""

from __future__ import annotations

from botbuilder.schema import Activity
from fastapi import APIRouter, Request, Response

router = APIRouter()


@router.post("/messages")
async def teams_messages(request: Request) -> Response:
    adapter = getattr(request.app.state, "teams_adapter", None)
    bot = getattr(request.app.state, "teams_bot", None)
    if adapter is None or bot is None:
        return Response(status_code=503, content="Teams integration not configured")

    body = await request.json()
    activity = Activity().deserialize(body)
    auth_header = request.headers.get("authorization", "")

    invoke_response = await adapter.process_activity(auth_header, activity, bot.on_turn)
    if invoke_response is None:
        return Response(status_code=201)
    return Response(
        content=invoke_response.body if invoke_response.body else None,
        status_code=invoke_response.status,
        media_type="application/json",
    )
