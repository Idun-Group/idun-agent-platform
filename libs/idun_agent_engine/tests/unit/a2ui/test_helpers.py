"""Unit tests for the A2UI dispatcher helpers.

We mock ``adispatch_custom_event`` and assert the helpers call it
with the right name and payload. This pins the wire-level contract:
the AG-UI adapter listens for events named ``idun.a2ui.messages``,
and breaking that contract would silently break every Idun agent
that emits A2UI surfaces.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from idun_agent_engine.a2ui import emit_surface


@pytest.mark.unit
@pytest.mark.asyncio
class TestEmitSurface:
    async def test_dispatches_with_correct_event_name(self) -> None:
        mock = AsyncMock()
        with patch("idun_agent_engine.a2ui.helpers.adispatch_custom_event", mock):
            await emit_surface(
                config={"configurable": {}},
                surface_id="s",
                components=[],
            )

        assert mock.await_count == 1
        args, kwargs = mock.call_args
        assert args[0] == "idun.a2ui.messages"

    async def test_dispatches_with_full_envelope(self) -> None:
        mock = AsyncMock()
        with patch("idun_agent_engine.a2ui.helpers.adispatch_custom_event", mock):
            await emit_surface(
                config={"configurable": {}},
                surface_id="results",
                components=[{"id": "root", "component": "Text", "text": "hi"}],
                fallback_text="hi",
            )

        args, kwargs = mock.call_args
        envelope = args[1]
        assert envelope["a2uiVersion"] == "v0.9"
        assert envelope["surfaceId"] == "results"
        assert envelope["fallbackText"] == "hi"
        assert len(envelope["messages"]) == 2
        assert envelope["messages"][0]["createSurface"]["surfaceId"] == "results"
        assert envelope["messages"][1]["updateComponents"]["components"] == [
            {"id": "root", "component": "Text", "text": "hi"}
        ]

    async def test_forwards_config_kwarg(self) -> None:
        mock = AsyncMock()
        config = {"configurable": {"thread_id": "t1"}}
        with patch("idun_agent_engine.a2ui.helpers.adispatch_custom_event", mock):
            await emit_surface(config=config, surface_id="s", components=[])
        _, kwargs = mock.call_args
        assert kwargs.get("config") is config
