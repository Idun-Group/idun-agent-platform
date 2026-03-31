"""Google Chat JWT bearer token verification."""

from __future__ import annotations

import logging

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

logger = logging.getLogger(__name__)

GOOGLE_CHAT_ISSUERS = {
    "chat@system.gserviceaccount.com",
    "https://accounts.google.com",
}


def verify_google_chat_token(
    bearer_token: str,
    project_number: str,
    webhook_url: str = "",
    local_mode: bool = False,
) -> bool:
    """Verify that a request originated from Google Chat.

    Google Chat sends a JWT bearer token in the ``Authorization`` header.
    The token audience depends on the Chat app configuration:

    - Workspace add-ons (newer): always the HTTPS webhook URL
    - Classic Chat apps: either project number or webhook URL

    We try both the project number and the webhook URL as audience.
    When ``local_mode`` is enabled, the webhook URL scheme is rewritten
    from ``http`` to ``https`` to account for TLS-terminating proxies
    like ngrok.
    """
    audiences = [project_number]
    if webhook_url:
        if local_mode:
            webhook_url = webhook_url.replace("http://", "https://", 1)
        audiences.append(webhook_url)

    last_error = None
    for audience in audiences:
        try:
            claim = id_token.verify_token(
                bearer_token,
                request=google_requests.Request(),
                audience=audience,
            )
            if claim.get("iss") not in GOOGLE_CHAT_ISSUERS:
                logger.warning(
                    "Google Chat JWT issuer mismatch: expected one of %s, got %s",
                    GOOGLE_CHAT_ISSUERS,
                    claim.get("iss"),
                )
                return False
            return True
        except Exception as exc:
            last_error = exc
            continue

    logger.error(
        "Google Chat JWT verification failed: %s. "
        "Tried audiences: %s. Check that the project_number in your "
        "integration config matches your GCP project.",
        last_error,
        audiences,
    )
    return False
