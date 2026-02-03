"""Langfuse observability handler implementation."""

from __future__ import annotations

import os
from typing import Any

from idun_agent_schema.engine.observability import _resolve_env

from ..base import ObservabilityHandlerBase


class LangfuseHandler(ObservabilityHandlerBase):
    """Langfuse handler providing LangChain callbacks and client setup."""

    provider = "langfuse"

    def __init__(self, options: dict[str, Any] | None = None):
        """Initialize handler, resolving env and preparing callbacks."""
        super().__init__(options)
        opts = self.options

        # Resolve and set env vars as required by Langfuse
        host = self._resolve_env(opts.get("host")) or os.getenv("LANGFUSE_BASE_URL")
        public_key = self._resolve_env(opts.get("public_key")) or os.getenv(
            "LANGFUSE_PUBLIC_KEY"
        )
        secret_key = self._resolve_env(opts.get("secret_key")) or os.getenv(
            "LANGFUSE_SECRET_KEY"
        )

        if host:
            os.environ["LANGFUSE_BASE_URL"] = host
        if public_key:
            os.environ["LANGFUSE_PUBLIC_KEY"] = public_key
        if secret_key:
            os.environ["LANGFUSE_SECRET_KEY"] = secret_key

        # Instantiate callback handler lazily to avoid hard dep if not installed
        self._callbacks: list[Any] = []
        self._langfuse_client = None
        try:
            from langfuse import get_client
            from langfuse.langchain import CallbackHandler

            # Initialize client for auth check
            self._langfuse_client = get_client()

            try:
                if self._langfuse_client.auth_check():
                    print("Langfuse client is authenticated and ready!")
                else:
                    print(
                        "Authentication failed. Please check your credentials and host."
                    )
            except Exception as e:
                print(f"Error during Langfuse client authentication: {e}")

            # Initialize callback handler
            # We pass the resolved credentials explicitly to ensure they are used
            # even if env vars were not successfully set or read.
            self._callbacks = [CallbackHandler()]
        except Exception as e:
            print(f"Failed to initialize Langfuse callback/client: {e}")
            self._callbacks = []

    @staticmethod
    def _resolve_env(value: str | None) -> str | None:
        return _resolve_env(value)

    def get_callbacks(self) -> list[Any]:
        """Return LangChain-compatible callback handlers (if available)."""
        return self._callbacks

    def get_client(self):
        """Return underlying Langfuse client instance (if created)."""
        return self._langfuse_client
