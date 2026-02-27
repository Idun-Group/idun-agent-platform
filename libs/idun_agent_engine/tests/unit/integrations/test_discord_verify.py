"""Tests for Discord Ed25519 signature verification."""

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from idun_agent_engine.integrations.discord.verify import verify_discord_signature


def _generate_keypair():
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    public_key_hex = public_key.public_bytes_raw().hex()
    return private_key, public_key_hex


@pytest.mark.unit
class TestVerifyDiscordSignature:
    def test_valid_signature(self):
        private_key, public_key_hex = _generate_keypair()
        timestamp = "1234567890"
        body = b'{"type": 1}'

        signature = private_key.sign(timestamp.encode() + body)
        signature_hex = signature.hex()

        assert verify_discord_signature(public_key_hex, signature_hex, timestamp, body)

    def test_invalid_signature(self):
        _, public_key_hex = _generate_keypair()

        assert not verify_discord_signature(
            public_key_hex, "ab" * 64, "1234567890", b'{"type": 1}'
        )

    def test_tampered_body(self):
        private_key, public_key_hex = _generate_keypair()
        timestamp = "1234567890"
        body = b'{"type": 1}'

        signature = private_key.sign(timestamp.encode() + body)
        signature_hex = signature.hex()

        assert not verify_discord_signature(
            public_key_hex, signature_hex, timestamp, b'{"type": 2}'
        )

    def test_wrong_public_key(self):
        private_key, _ = _generate_keypair()
        _, other_public_key_hex = _generate_keypair()
        timestamp = "1234567890"
        body = b'{"type": 1}'

        signature = private_key.sign(timestamp.encode() + body)
        signature_hex = signature.hex()

        assert not verify_discord_signature(
            other_public_key_hex, signature_hex, timestamp, body
        )

    def test_invalid_hex_returns_false(self):
        assert not verify_discord_signature("not-hex", "not-hex", "ts", b"body")
