"""Tests for Discord webhook handler endpoints."""

import json

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI
from fastapi.testclient import TestClient
from idun_agent_schema.engine.integrations.discord_webhook import (
    InteractionResponseType,
    InteractionType,
)

from idun_agent_engine.integrations.discord.handler import router


def _generate_keypair():
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    public_key_hex = public_key.public_bytes_raw().hex()
    return private_key, public_key_hex


def _sign_request(private_key: Ed25519PrivateKey, timestamp: str, body: bytes):
    signature = private_key.sign(timestamp.encode() + body)
    return signature.hex()


def _make_app(public_key_hex: str) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/integrations/discord")
    app.state.discord_public_key = public_key_hex
    return app


@pytest.mark.unit
class TestDiscordPing:
    def test_ping_returns_pong(self):
        private_key, public_key_hex = _generate_keypair()
        app = _make_app(public_key_hex)

        body = json.dumps({"type": InteractionType.PING, "id": "1", "token": ""}).encode()
        timestamp = "1234567890"
        signature = _sign_request(private_key, timestamp, body)

        with TestClient(app) as client:
            resp = client.post(
                "/integrations/discord/webhook",
                content=body,
                headers={
                    "X-Signature-Ed25519": signature,
                    "X-Signature-Timestamp": timestamp,
                    "Content-Type": "application/json",
                },
            )
            assert resp.status_code == 200
            assert resp.json()["type"] == InteractionResponseType.PONG

    def test_invalid_signature_returns_401(self):
        _, public_key_hex = _generate_keypair()
        app = _make_app(public_key_hex)

        body = json.dumps({"type": InteractionType.PING, "id": "1", "token": ""}).encode()

        with TestClient(app) as client:
            resp = client.post(
                "/integrations/discord/webhook",
                content=body,
                headers={
                    "X-Signature-Ed25519": "ab" * 64,
                    "X-Signature-Timestamp": "1234567890",
                    "Content-Type": "application/json",
                },
            )
            assert resp.status_code == 401


@pytest.mark.unit
class TestDiscordApplicationCommand:
    def test_application_command_returns_deferred(self):
        from unittest.mock import AsyncMock

        private_key, public_key_hex = _generate_keypair()
        app = _make_app(public_key_hex)
        app.state.agent = AsyncMock()
        app.state.agent.invoke = AsyncMock(return_value="Hello from agent")
        app.state.discord_client = AsyncMock()

        body = json.dumps({
            "type": InteractionType.APPLICATION_COMMAND,
            "id": "interaction_1",
            "token": "interaction_token_abc",
            "data": {
                "name": "ask",
                "options": [{"name": "query", "type": 3, "value": "what is AI?"}],
            },
            "member": {"user": {"id": "user_123", "username": "testuser"}},
        }).encode()
        timestamp = "1234567890"
        signature = _sign_request(private_key, timestamp, body)

        with TestClient(app) as client:
            resp = client.post(
                "/integrations/discord/webhook",
                content=body,
                headers={
                    "X-Signature-Ed25519": signature,
                    "X-Signature-Timestamp": timestamp,
                    "Content-Type": "application/json",
                },
            )
            assert resp.status_code == 200
            assert resp.json()["type"] == InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE

    def test_no_agent_returns_503(self):
        private_key, public_key_hex = _generate_keypair()
        app = _make_app(public_key_hex)
        # No agent or client set on app.state

        body = json.dumps({
            "type": InteractionType.APPLICATION_COMMAND,
            "id": "interaction_1",
            "token": "token_abc",
            "data": {"name": "ask", "options": []},
        }).encode()
        timestamp = "1234567890"
        signature = _sign_request(private_key, timestamp, body)

        with TestClient(app) as client:
            resp = client.post(
                "/integrations/discord/webhook",
                content=body,
                headers={
                    "X-Signature-Ed25519": signature,
                    "X-Signature-Timestamp": timestamp,
                    "Content-Type": "application/json",
                },
            )
            assert resp.status_code == 503

    def test_unknown_interaction_type_returns_200(self):
        private_key, public_key_hex = _generate_keypair()
        app = _make_app(public_key_hex)

        body = json.dumps({
            "type": 99,
            "id": "1",
            "token": "",
        }).encode()
        timestamp = "1234567890"
        signature = _sign_request(private_key, timestamp, body)

        with TestClient(app) as client:
            resp = client.post(
                "/integrations/discord/webhook",
                content=body,
                headers={
                    "X-Signature-Ed25519": signature,
                    "X-Signature-Timestamp": timestamp,
                    "Content-Type": "application/json",
                },
            )
            assert resp.status_code == 200


@pytest.mark.unit
class TestDiscordWebhookPayloadParsing:
    """Test the Pydantic models for Discord interaction payloads."""

    def test_ping_interaction(self):
        from idun_agent_schema.engine.integrations.discord_webhook import (
            DiscordInteraction,
        )

        interaction = DiscordInteraction.model_validate({
            "type": 1, "id": "abc", "token": "tok"
        })
        assert interaction.type == InteractionType.PING
        assert interaction.id == "abc"

    def test_command_interaction_extracts_text(self):
        from idun_agent_schema.engine.integrations.discord_webhook import (
            DiscordInteraction,
        )

        interaction = DiscordInteraction.model_validate({
            "type": 2,
            "id": "abc",
            "token": "tok",
            "data": {
                "name": "ask",
                "options": [{"name": "query", "type": 3, "value": "hello world"}],
            },
            "member": {"user": {"id": "user_1", "username": "test"}},
        })
        assert interaction.extract_command_text() == "hello world"
        assert interaction.resolve_user_id() == "user_1"

    def test_command_without_options_falls_back_to_name(self):
        from idun_agent_schema.engine.integrations.discord_webhook import (
            DiscordInteraction,
        )

        interaction = DiscordInteraction.model_validate({
            "type": 2, "id": "abc", "token": "tok",
            "data": {"name": "ping", "options": []},
        })
        assert interaction.extract_command_text() == "ping"

    def test_resolve_user_id_dm(self):
        from idun_agent_schema.engine.integrations.discord_webhook import (
            DiscordInteraction,
        )

        interaction = DiscordInteraction.model_validate({
            "type": 2, "id": "abc", "token": "tok",
            "user": {"id": "dm_user", "username": "dmuser"},
        })
        assert interaction.resolve_user_id() == "dm_user"

    def test_resolve_user_id_fallback_to_interaction_id(self):
        from idun_agent_schema.engine.integrations.discord_webhook import (
            DiscordInteraction,
        )

        interaction = DiscordInteraction.model_validate({
            "type": 2, "id": "fallback_id", "token": "tok",
        })
        assert interaction.resolve_user_id() == "fallback_id"
