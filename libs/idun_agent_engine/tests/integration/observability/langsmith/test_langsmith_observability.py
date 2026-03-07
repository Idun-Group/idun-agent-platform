import os

import pytest


@pytest.fixture
def skip_if_no_langsmith_credentials():
    if not os.getenv("LANGSMITH_API_KEY"):
        pytest.skip("LangSmith credentials not set")


@pytest.mark.integration
@pytest.mark.requires_langsmith
def test_langsmith_handler_connects(skip_if_no_langsmith_credentials):
    from idun_agent_engine.observability.langsmith.langsmith_handler import (
        LangsmithHandler,
    )

    handler = LangsmithHandler(
        {
            "api_key": os.environ["LANGSMITH_API_KEY"],
            "project_name": os.environ.get("LANGSMITH_PROJECT", "test"),
            "endpoint": os.environ.get(
                "LANGSMITH_ENDPOINT", "https://api.smith.langchain.com"
            ),
        }
    )

    assert os.environ.get("LANGSMITH_TRACING") == "true"
    assert handler.get_callbacks() == []


@pytest.mark.integration
@pytest.mark.requires_langsmith
def test_langsmith_factory_creates_handler(skip_if_no_langsmith_credentials):
    from idun_agent_schema.engine.observability_v2 import (
        LangsmithConfig,
        ObservabilityConfig,
        ObservabilityProvider,
    )

    from idun_agent_engine.observability.base import create_observability_handler

    config = ObservabilityConfig(
        enabled=True,
        provider=ObservabilityProvider.LANGSMITH,
        config=LangsmithConfig(
            api_key=os.environ["LANGSMITH_API_KEY"],
            project_name=os.environ.get("LANGSMITH_PROJECT", "test"),
            endpoint=os.environ.get(
                "LANGSMITH_ENDPOINT", "https://api.smith.langchain.com"
            ),
        ),
    )

    handler, info = create_observability_handler(config)

    assert handler is not None
    assert info["enabled"] is True
    assert info["provider"] == "langsmith"
