"""Slack request signature verification using HMAC-SHA256."""

from __future__ import annotations

import logging

from slack_sdk.signature import SignatureVerifier

logger = logging.getLogger(__name__)


def verify_slack_signature(
    signing_secret: str,
    timestamp: str,
    signature: str,
    body: str,
) -> bool:
    """Verify that a request originated from Slack."""
    try:
        verifier = SignatureVerifier(signing_secret=signing_secret)
        return verifier.is_valid(body=body, timestamp=timestamp, signature=signature)
    except Exception:
        logger.debug("Slack signature verification failed", exc_info=True)
        return False
