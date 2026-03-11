"""Tests for Slack webhook handler endpoints."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from idun_agent_engine.integrations.slack.handler import router


def _make_app(signing_secret: str | None = "test-secret") -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/integrations/slack")
    if signing_secret is not None:
        app.state.slack_signing_secret = signing_secret
    return app


def _post_event(client: TestClient, payload: dict) -> ...:
    """POST a Slack event with signature verification bypassed."""
    return client.post(
        "/integrations/slack/webhook",
        content=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )


@pytest.mark.unit
class TestSlackUrlVerification:
    @patch(
        "idun_agent_engine.integrations.slack.handler.verify_slack_signature",
        return_value=True,
    )
    def test_url_verification_returns_challenge(self, _mock_verify):
        app = _make_app()
        with TestClient(app) as client:
            resp = _post_event(client, {
                "type": "url_verification",
                "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P",
                "token": "test",
            })
            assert resp.status_code == 200
            assert resp.text == "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"


@pytest.mark.unit
class TestSlackWebhookAuth:
    def test_missing_signing_secret_returns_503(self):
        app = _make_app(signing_secret=None)
        with TestClient(app) as client:
            resp = _post_event(client, {"type": "event_callback"})
            assert resp.status_code == 503

    @patch(
        "idun_agent_engine.integrations.slack.handler.verify_slack_signature",
        return_value=False,
    )
    def test_invalid_signature_returns_401(self, _mock_verify):
        app = _make_app()
        with TestClient(app) as client:
            resp = _post_event(client, {"type": "event_callback"})
            assert resp.status_code == 401


@pytest.mark.unit
class TestSlackMessageHandling:
    @patch(
        "idun_agent_engine.integrations.slack.handler.verify_slack_signature",
        return_value=True,
    )
    def test_message_invokes_agent_and_sends_reply(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.agent.invoke = AsyncMock(return_value="Agent reply")
        app.state.slack_client = AsyncMock()
        app.state.slack_client.send_message = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(client, {
                "type": "event_callback",
                "event": {
                    "type": "message",
                    "text": "Hello agent",
                    "user": "U12345",
                    "channel": "C67890",
                    "ts": "1234567890.123456",
                },
                "token": "test",
                "event_id": "Ev01",
                "event_time": 1234567890,
            })
            assert resp.status_code == 200

        app.state.agent.invoke.assert_called_once_with(
            {"query": "Hello agent", "session_id": "U12345"}
        )
        app.state.slack_client.send_message.assert_called_once_with(
            channel="C67890", text="Agent reply"
        )

    @patch(
        "idun_agent_engine.integrations.slack.handler.verify_slack_signature",
        return_value=True,
    )
    def test_bot_message_is_skipped(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.slack_client = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(client, {
                "type": "event_callback",
                "event": {
                    "type": "message",
                    "text": "I am a bot",
                    "user": "U_BOT",
                    "channel": "C67890",
                    "ts": "1234567890.123456",
                    "bot_id": "B_BOT",
                },
                "token": "test",
                "event_id": "Ev02",
                "event_time": 1234567890,
            })
            assert resp.status_code == 200

        app.state.agent.invoke.assert_not_called()

    @patch(
        "idun_agent_engine.integrations.slack.handler.verify_slack_signature",
        return_value=True,
    )
    def test_agent_error_still_returns_200(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.agent.invoke = AsyncMock(side_effect=RuntimeError("Agent crashed"))
        app.state.slack_client = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(client, {
                "type": "event_callback",
                "event": {
                    "type": "message",
                    "text": "Crash me",
                    "user": "U12345",
                    "channel": "C67890",
                    "ts": "1234567890.123456",
                },
                "token": "test",
                "event_id": "Ev03",
                "event_time": 1234567890,
            })
            assert resp.status_code == 200

        app.state.slack_client.send_message.assert_not_called()

    @patch(
        "idun_agent_engine.integrations.slack.handler.verify_slack_signature",
        return_value=True,
    )
    def test_no_agent_returns_503(self, _mock_verify):
        app = _make_app()
        # No agent or client on app.state

        with TestClient(app) as client:
            resp = _post_event(client, {
                "type": "event_callback",
                "event": {
                    "type": "message",
                    "text": "Hello",
                    "user": "U12345",
                    "channel": "C67890",
                    "ts": "1234567890.123456",
                },
                "token": "test",
                "event_id": "Ev04",
                "event_time": 1234567890,
            })
            assert resp.status_code == 503

    @patch(
        "idun_agent_engine.integrations.slack.handler.verify_slack_signature",
        return_value=True,
    )
    def test_non_message_event_returns_200(self, _mock_verify):
        app = _make_app()
        app.state.agent = AsyncMock()
        app.state.slack_client = AsyncMock()

        with TestClient(app) as client:
            resp = _post_event(client, {
                "type": "event_callback",
                "event": {
                    "type": "app_mention",
                    "text": "Hey",
                    "user": "U12345",
                    "channel": "C67890",
                    "ts": "1234567890.123456",
                },
                "token": "test",
                "event_id": "Ev05",
                "event_time": 1234567890,
            })
            assert resp.status_code == 200

        app.state.agent.invoke.assert_not_called()
