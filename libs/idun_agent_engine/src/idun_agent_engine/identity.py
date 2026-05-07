"""Per-request identity for adapters that need user-scoped storage.

Routes set ``current_user_id`` from SSO claims (or fall back to the
default for unauthenticated callers); adapters that scope by user
read it. Today only the ADK adapter uses it; LangGraph checkpointers
have no user-id concept and ignore it.
"""

from __future__ import annotations

import contextvars

current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "idun_engine_current_user_id", default="standalone"
)
