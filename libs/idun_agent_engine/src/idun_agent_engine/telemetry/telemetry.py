"""Non-blocking telemetry for Idun Agent Engine.

Telemetry is ON by default and can be disabled with `IDUN_TELEMETRY_ENABLED=false`.

We persist a stable `distinct_id` in the OS cache directory at:
`<cache_dir>/idun/telemetry_user_id`
"""

from __future__ import annotations

import os
import platform
import re
import sys
import threading
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from platformdirs import user_cache_dir

from .config import telemetry_enabled

_POSTHOG_HOST = "https://us.i.posthog.com"
_POSTHOG_PROJECT_API_KEY = "phc_mpAplkH6w5zK1aSkkG0IL5Ys55m6X34BFvGozB2NqPw"
_DISTINCT_ID_ENV = "IDUN_TELEMETRY_DISTINCT_ID"
_CACHE_APP_NAME = "idun"
_CACHE_DISTINCT_ID_FILE = "telemetry_user_id"
_MAX_VALUE_LENGTH = 200
_SENSITIVE_KEY_FRAGMENTS = (
    "api_key",
    "apikey",
    "access_key",
    "accesskey",
    "private_key",
    "privatekey",
    "secret",
    "token",
    "password",
    "passphrase",
    "client_secret",
    "clientsecret",
    "bearer",
    "authorization",
)


def _is_sensitive_key(key: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", "_", key.lower())
    return any(fragment in normalized for fragment in _SENSITIVE_KEY_FRAGMENTS)


def _is_private_key_value(value: str) -> bool:
    upper_value = value.upper()
    return "PRIVATE KEY" in upper_value or "BEGIN OPENSSH PRIVATE KEY" in upper_value


def _truncate_value(value: str) -> str:
    if len(value) <= _MAX_VALUE_LENGTH:
        return value
    return value[:_MAX_VALUE_LENGTH]


def sanitize_telemetry_config(value: Any) -> Any:
    """Return a telemetry-safe copy of config objects."""
    if hasattr(value, "model_dump") and callable(value.model_dump):
        value = value.model_dump()  # type: ignore[assignment]
    elif hasattr(value, "dict") and callable(value.dict):
        value = value.dict()  # type: ignore[assignment]

    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            if isinstance(key, str) and _is_sensitive_key(key):
                sanitized[key] = "[redacted]"
            else:
                sanitized[key] = sanitize_telemetry_config(item)
        return sanitized

    if isinstance(value, (list, tuple, set)):
        return [sanitize_telemetry_config(item) for item in value]

    if isinstance(value, str):
        if _is_private_key_value(value):
            return "[redacted]"
        return _truncate_value(value)

    return value


def _safe_read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return None


def _safe_write_text(path: Path, text: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    except Exception:
        # Best-effort only.
        return


def _get_or_create_distinct_id() -> str | None:
    """Return a stable distinct id.

    Preference order:
    - `IDUN_TELEMETRY_DISTINCT_ID` (if set)
    - A UUID persisted to `<cache_dir>/idun/telemetry_user_id`
    """
    raw = os.environ.get(_DISTINCT_ID_ENV)
    if raw and raw.strip():
        return raw.strip()

    cache_dir = Path(user_cache_dir(_CACHE_APP_NAME))
    id_path = cache_dir / _CACHE_DISTINCT_ID_FILE

    existing = _safe_read_text(id_path)
    if existing:
        return existing

    new_id = str(uuid.uuid4())
    _safe_write_text(id_path, new_id)
    return new_id


def _common_properties() -> dict[str, Any]:
    from .._version import __version__

    return {
        "library": "idun-agent-engine",
        "library_version": __version__,
        "python_version": platform.python_version(),
        "python_implementation": platform.python_implementation(),
        "platform": sys.platform,
        "os": platform.system(),
        "os_version": platform.release(),
    }


@dataclass(slots=True)
class IdunTelemetry:
    """Non-blocking telemetry client."""

    enabled: bool = field(default_factory=telemetry_enabled)
    _executor: ThreadPoolExecutor | None = field(default=None, init=False, repr=False)
    _client: Any | None = field(default=None, init=False, repr=False)
    _client_lock: threading.Lock = field(
        default_factory=threading.Lock, init=False, repr=False
    )
    _distinct_id: str | None = field(default=None, init=False, repr=False)

    def _ensure_executor(self) -> ThreadPoolExecutor:
        if self._executor is None:
            self._executor = ThreadPoolExecutor(
                max_workers=1, thread_name_prefix="idun-telemetry"
            )
        return self._executor

    def _get_client(self) -> Any | None:
        if not self.enabled:
            return None
        if self._client is not None:
            return self._client

        with self._client_lock:
            if self._client is not None:
                return self._client
            try:
                from posthog import Posthog
            except Exception:
                # Dependency missing or import failure should not break runtime.
                return None

            client = Posthog(_POSTHOG_PROJECT_API_KEY, host=_POSTHOG_HOST)
            self._client = client
            self._distinct_id = _get_or_create_distinct_id()
            return self._client

    def capture(
        self, event: str, properties: dict[str, Any] | None = None
    ) -> Future[None] | None:
        """Capture an event asynchronously (best-effort)."""
        if not self.enabled:
            return None

        executor = self._ensure_executor()

        def _send() -> None:
            client = self._get_client()
            if client is None:
                return

            merged: dict[str, Any] = _common_properties()
            if properties:
                merged.update(properties)

            try:
                if self._distinct_id:
                    client.capture(
                        event=event,
                        distinct_id=self._distinct_id,
                        properties=merged,
                    )
                else:
                    client.capture(event=event, properties=merged)
            except Exception:
                # Never fail user code because of telemetry.
                return

        try:
            return executor.submit(_send)
        except Exception:
            return None

    def shutdown(self, timeout_seconds: float = 1.0) -> None:
        """Best-effort flush/shutdown without blocking application shutdown."""
        executor = self._executor
        client = self._client

        if executor is None:
            return

        def _shutdown_client() -> None:
            try:
                if client is not None:
                    shutdown_fn = getattr(client, "shutdown", None)
                    if callable(shutdown_fn):
                        shutdown_fn()
            except Exception:
                return

        try:
            fut = executor.submit(_shutdown_client)
            fut.result(timeout=timeout_seconds)
        except Exception:
            pass
        finally:
            try:
                executor.shutdown(wait=False, cancel_futures=False)
            except Exception:
                pass
