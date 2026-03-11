"""Session refresh middleware — sliding window session expiry."""

import logging
import time
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.settings import get_settings

logger = logging.getLogger(__name__)


class SessionRefreshMiddleware(BaseHTTPMiddleware):
    """Re-sign the session cookie on authenticated requests to implement
    a sliding-window session expiry.

    The cookie is only refreshed when the token age exceeds a configurable
    threshold (default: half the session TTL).
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)

        token = request.cookies.get("sid")
        if not token:
            return response

        try:
            self._maybe_refresh(token, response)
        except Exception:
            logger.debug("Session refresh skipped due to error", exc_info=True)

        return response

    @staticmethod
    def _maybe_refresh(token: str, response: Response) -> None:
        from app.api.v1.routers.auth import (
            _get_serializer,
            _set_session_cookie,
        )

        settings = get_settings()
        serializer = _get_serializer()

        try:
            payload: dict[str, Any]
            payload, signing_dt = serializer.loads(
                token, max_age=None, return_timestamp=True
            )
        except Exception:
            return

        now = time.time()
        token_age = now - signing_dt.timestamp()

        ttl = settings.auth.session_ttl_seconds
        threshold = settings.auth.session_refresh_threshold_seconds
        if threshold is None:
            threshold = ttl // 2

        if token_age < threshold:
            return

        if "created_at" not in payload:
            payload["created_at"] = int(now)

        _set_session_cookie(response, payload, max_age=ttl)
        logger.debug(
            "Refreshed session cookie (age=%ds, threshold=%ds)",
            int(token_age),
            threshold,
        )
