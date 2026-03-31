"""Tests for Google Chat webhook handler endpoints."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from idun_agent_engine.integrations.google_chat.handler import router


def _make_app(project_number: str | None = "123456") -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/integrations/google-chat")
    if project_number is not None:
        app.state.google_chat_project_number = project_number
    return app


def _post_event(client: TestClient, payload: dict) -> ...:
    """POST a Google Chat event with auth header."""
    return client.post(
        "/integrations/google-chat/webhook",
        content=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer fake-jwt-token",
        },
    )


def _message_payload(
    text: str = "Hello agent",
    argument_text: str = "Hello agent",
    user_name: str = "users/12345",
    user_type: str = "HUMAN",
    space_name: str = "spaces/AAAA",
) -> dict:
    return {
        "type": "MESSAGE",
        "eventTime": "2024-01-01T00:00:00Z",
        "message": {
            "name": "spaces/AAAA/messages/msg1",
            "text": text,
            "argumentText": argument_text,
            "sender": {
                "name": user_name,
                "displayName": "Test User",
                "type": user_type,
                "email": "test@example.com",
            },
            "space": {
                "name": space_name,
                "type": "ROOM",
                "displayName": "Test Room",
            },
            "thread": {"name": "spaces/AAAA/threads/thread1"},
        },
        "user": {
            "name": user_name,
            "displayName": "Test User",
            "type": user_type,
        },
        "space": {
            "name": space_name,
            "type": "ROOM",
        },
    }


@pytest.mark.unit
class TestGoogleChatWebhookAuth:
    def test_missing_project_number_returns_503(self):
        app = _make_app(project_number=None)
        with TestClient(app) as client:
            resp = _post_event(client, {"type": "MESSAGE"})
            assert resp.status_code == 503

    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=False,
    )
    def test_invalid_token_returns_401(self, _mock_verify):
        app = _make_app()
        with TestClient(app) as client:
            resp = _post_event(client, _message_payload())
            assert resp.status_code == 401


@pytest.mark.unit
class TestGoogleChatAddedToSpace:
    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=True,
    )
    def test_added_to_space_returns_200(self, _mock_verify):
        app = _make_app()
        with TestClient(app) as client:
            resp = _post_event(
                client,
                {"type": "ADDED_TO_SPACE", "eventTime": "2024-01-01T00:00:00Z"},
            )
            assert resp.status_code == 200


@pytest.mark.unit
class TestGoogleChatMessageHandling:
    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=True,
    )
    def test_message_invokes_agent_and_sends_reply(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.agent.invoke = AsyncMock(return_value="Agent reply")
        app.state.google_chat_client = AsyncMock()
        app.state.google_chat_client.send_message = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(client, _message_payload())
            assert resp.status_code == 200

        app.state.agent.invoke.assert_called_once_with(
            {"query": "Hello agent", "session_id": "users/12345"}
        )
        app.state.google_chat_client.send_message.assert_called_once_with(
            space_name="spaces/AAAA", text="Agent reply"
        )

    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=True,
    )
    def test_uses_argument_text_over_raw_text(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.agent.invoke = AsyncMock(return_value="Reply")
        app.state.google_chat_client = AsyncMock()
        app.state.google_chat_client.send_message = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(
                client,
                _message_payload(
                    text="@bot do stuff",
                    argument_text=" do stuff",
                ),
            )
            assert resp.status_code == 200

        app.state.agent.invoke.assert_called_once_with(
            {"query": "do stuff", "session_id": "users/12345"}
        )

    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=True,
    )
    def test_bot_message_is_skipped(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.google_chat_client = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(
                client,
                _message_payload(user_type="BOT"),
            )
            assert resp.status_code == 200

        app.state.agent.invoke.assert_not_called()

    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=True,
    )
    def test_agent_error_still_returns_200(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.agent.invoke = AsyncMock(
            side_effect=RuntimeError("Agent crashed")
        )
        app.state.google_chat_client = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(client, _message_payload())
            assert resp.status_code == 200

        app.state.google_chat_client.send_message.assert_not_called()

    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=True,
    )
    def test_no_agent_returns_503(self, _mock_verify):
        app = _make_app()

        with TestClient(app) as client:
            resp = _post_event(client, _message_payload())
            assert resp.status_code == 503

    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=True,
    )
    def test_non_message_event_returns_200(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.google_chat_client = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(
                client,
                {"type": "REMOVED_FROM_SPACE", "eventTime": "2024-01-01T00:00:00Z"},
            )
            assert resp.status_code == 200

        app.state.agent.invoke.assert_not_called()

    @patch(
        "idun_agent_engine.integrations.google_chat.handler.verify_google_chat_token",
        return_value=True,
    )
    def test_missing_space_name_returns_200(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.google_chat_client = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(
                client,
                _message_payload(space_name=""),
            )
            assert resp.status_code == 200

        app.state.agent.invoke.assert_not_called()
