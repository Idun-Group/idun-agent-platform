"""Ed25519 signature verification for Discord interaction webhooks."""

from __future__ import annotations

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def verify_discord_signature(
    public_key_hex: str,
    signature_hex: str,
    timestamp: str,
    body: bytes,
) -> bool:
    """Verify the Ed25519 signature sent by Discord.

    Discord sends ``X-Signature-Ed25519`` (hex-encoded signature) and
    ``X-Signature-Timestamp`` headers.  The signed message is
    ``timestamp + body``.

    Args:
        public_key_hex: Application's Ed25519 public key (hex string).
        signature_hex: Value of the ``X-Signature-Ed25519`` header.
        timestamp: Value of the ``X-Signature-Timestamp`` header.
        body: Raw request body bytes.

    Returns:
        ``True`` if the signature is valid, ``False`` otherwise.
    """
    try:
        key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        key.verify(bytes.fromhex(signature_hex), timestamp.encode() + body)
        return True
    except (InvalidSignature, ValueError, Exception):
        return False
