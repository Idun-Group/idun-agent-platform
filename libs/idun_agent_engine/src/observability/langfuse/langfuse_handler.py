from __future__ import annotations

from typing import Any, List, Optional, Dict
import os
from ..utils import _resolve_env
from ..base import ObservabilityHandlerBase


class LangfuseHandler(ObservabilityHandlerBase):
    provider = "langfuse"

    def __init__(self, options: Optional[Dict[str, Any]] = None):
        super().__init__(options)
        opts = self.options

        # Resolve and set env vars as required by Langfuse
        host = self._resolve_env(opts.get("host")) or os.getenv("LANGFUSE_HOST")
        public_key = self._resolve_env(opts.get("public_key")) or os.getenv("LANGFUSE_PUBLIC_KEY")
        secret_key = self._resolve_env(opts.get("secret_key")) or os.getenv("LANGFUSE_SECRET_KEY")

        if host:
            os.environ["LANGFUSE_HOST"] = host
        if public_key:
            os.environ["LANGFUSE_PUBLIC_KEY"] = public_key
        if secret_key:
            os.environ["LANGFUSE_SECRET_KEY"] = secret_key

        # Instantiate callback handler lazily to avoid hard dep if not installed
        self._callbacks: List[Any] = []
        self._langfuse_client = None
        try:
            from langfuse import get_client
            from langfuse.langchain import CallbackHandler
            
            self._langfuse_client = get_client()

            try:
                if self._langfuse_client.auth_check():
                    print("Langfuse client is authenticated and ready!")
                else:
                    print("Authentication failed. Please check your credentials and host.")
            except Exception:
                pass

            self._callbacks = [CallbackHandler()]
        except Exception:
            self._callbacks = []

    @staticmethod
    def _resolve_env(value: Optional[str]) -> Optional[str]:
        return _resolve_env(value)

    def get_callbacks(self) -> List[Any]:
        return self._callbacks

    def get_client(self):
        return self._langfuse_client


