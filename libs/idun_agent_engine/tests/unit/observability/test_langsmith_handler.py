import os
from unittest.mock import patch

import pytest


@pytest.mark.unit
class TestLangsmithHandler:
    def test_sets_tracing_env_var(self):
        with patch.dict(os.environ, {}, clear=False):
            from idun_agent_engine.observability.langsmith.langsmith_handler import (
                LangsmithHandler,
            )

            with patch("langsmith.Client"):
                LangsmithHandler(
                    {"api_key": "test-key", "project_name": "proj", "endpoint": ""}
                )

            assert os.environ.get("LANGSMITH_TRACING") == "true"
            assert os.environ.get("LANGSMITH_API_KEY") == "test-key"
            assert os.environ.get("LANGSMITH_PROJECT") == "proj"

    def test_sets_endpoint_env_var(self):
        with patch.dict(os.environ, {}, clear=False):
            from idun_agent_engine.observability.langsmith.langsmith_handler import (
                LangsmithHandler,
            )

            with patch("langsmith.Client"):
                LangsmithHandler({"endpoint": "https://eu.api.smith.langchain.com"})

            assert (
                os.environ.get("LANGSMITH_ENDPOINT")
                == "https://eu.api.smith.langchain.com"
            )

    def test_returns_empty_callbacks(self):
        with patch.dict(os.environ, {}, clear=False):
            from idun_agent_engine.observability.langsmith.langsmith_handler import (
                LangsmithHandler,
            )

            with patch("langsmith.Client"):
                handler = LangsmithHandler({"api_key": "k"})

            assert handler.get_callbacks() == []

    def test_handles_missing_langsmith_sdk(self):
        import builtins

        real_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "langsmith":
                raise ImportError("No module named 'langsmith'")
            return real_import(name, *args, **kwargs)

        with patch.dict(os.environ, {}, clear=False):
            with patch("builtins.__import__", side_effect=mock_import):
                from idun_agent_engine.observability.langsmith.langsmith_handler import (
                    LangsmithHandler,
                )

                # Should not raise, just log an error
                handler = LangsmithHandler({"api_key": "k"})
                assert handler.get_callbacks() == []

    def test_skips_empty_options(self):
        with patch.dict(os.environ, {}, clear=False):
            # Remove keys that might exist from other tests
            os.environ.pop("LANGSMITH_API_KEY", None)
            os.environ.pop("LANGSMITH_PROJECT", None)
            os.environ.pop("LANGSMITH_ENDPOINT", None)

            from idun_agent_engine.observability.langsmith.langsmith_handler import (
                LangsmithHandler,
            )

            with patch("langsmith.Client"):
                LangsmithHandler({"api_key": "", "project_name": "", "endpoint": ""})

            assert os.environ.get("LANGSMITH_TRACING") == "true"
            # Empty strings should not be set
            assert os.environ.get("LANGSMITH_API_KEY") is None
            assert os.environ.get("LANGSMITH_PROJECT") is None
            assert os.environ.get("LANGSMITH_ENDPOINT") is None
