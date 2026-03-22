import os
from pathlib import Path

import pytest
from fastapi import HTTPException


@pytest.fixture
def skip_if_no_guardrails_api_key():
    if not os.getenv("GUARDRAILS_API_KEY"):
        pytest.skip("GUARDRAILS_API_KEY not set")


@pytest.fixture
def langgraph_config_with_ban_list_guardrail(skip_if_no_guardrails_api_key):
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test LangGraph Agent with Guardrails",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
        "guardrails": {
            "input": [
                {
                    "config_id": "ban_list",
                    "api_key": os.getenv("GUARDRAILS_API_KEY"),
                    "guard_url": "hub://guardrails/ban_list",
                    "reject_message": "Your message contains banned words!",
                    "guard_params": {"banned_words": ["badword", "forbidden"]},
                }
            ],
            "output": [],
        },
    }


@pytest.fixture
def langgraph_config_with_pii_guardrail(skip_if_no_guardrails_api_key):
    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    return {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test LangGraph Agent with PII Detection",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
        "guardrails": {
            "input": [
                {
                    "config_id": "detect_pii",
                    "api_key": os.getenv("GUARDRAILS_API_KEY"),
                    "guard_url": "hub://guardrails/detect_pii",
                    "reject_message": "Your message contains PII!",
                    "guard_params": {"pii_entities": ["EMAIL_ADDRESS", "PHONE_NUMBER"]},
                }
            ],
            "output": [],
        },
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_ban_list_guardrail_blocks_banned_words(
    langgraph_config_with_ban_list_guardrail,
):
    from idun_agent_engine.core.config_builder import ConfigBuilder
    from idun_agent_engine.server.lifespan import _parse_guardrails
    from idun_agent_engine.server.routers.agent import _run_guardrails

    engine_config = ConfigBuilder.from_dict(
        langgraph_config_with_ban_list_guardrail
    ).build()
    await ConfigBuilder.initialize_agent_from_config(engine_config)

    guardrails = _parse_guardrails(engine_config.guardrails)

    banned_message = "This message contains a badword in it"

    with pytest.raises(HTTPException) as exc_info:
        _run_guardrails(
            guardrails,
            {"query": banned_message, "session_id": "test123"},
            position="input",
        )
    assert exc_info.value.status_code == 429
    assert "banned words" in exc_info.value.detail.lower()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_ban_list_guardrail_allows_clean_messages(
    langgraph_config_with_ban_list_guardrail,
):
    from idun_agent_engine.core.config_builder import ConfigBuilder
    from idun_agent_engine.server.lifespan import _parse_guardrails
    from idun_agent_engine.server.routers.agent import _run_guardrails

    engine_config = ConfigBuilder.from_dict(
        langgraph_config_with_ban_list_guardrail
    ).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    guardrails = _parse_guardrails(engine_config.guardrails)

    clean_message = "This is a perfectly clean message"
    message = {"query": clean_message, "session_id": "test123"}

    _run_guardrails(guardrails, message, position="input")
    response = await agent.invoke(message)

    assert response is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_pii_guardrail_blocks_email_addresses(
    langgraph_config_with_pii_guardrail,
):
    from idun_agent_engine.core.config_builder import ConfigBuilder
    from idun_agent_engine.server.lifespan import _parse_guardrails
    from idun_agent_engine.server.routers.agent import _run_guardrails

    engine_config = ConfigBuilder.from_dict(langgraph_config_with_pii_guardrail).build()
    await ConfigBuilder.initialize_agent_from_config(engine_config)

    guardrails = _parse_guardrails(engine_config.guardrails)

    message_with_email = "Please contact me at user@example.com for more info"

    with pytest.raises(HTTPException) as exc_info:
        _run_guardrails(
            guardrails,
            {"query": message_with_email, "session_id": "test123"},
            position="input",
        )
    assert exc_info.value.status_code == 429


@pytest.mark.integration
@pytest.mark.asyncio
async def test_pii_guardrail_allows_messages_without_pii(
    langgraph_config_with_pii_guardrail,
):
    from idun_agent_engine.core.config_builder import ConfigBuilder
    from idun_agent_engine.server.lifespan import _parse_guardrails
    from idun_agent_engine.server.routers.agent import _run_guardrails

    engine_config = ConfigBuilder.from_dict(langgraph_config_with_pii_guardrail).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    guardrails = _parse_guardrails(engine_config.guardrails)

    clean_message = "This message has no personal information"
    message = {"query": clean_message, "session_id": "test123"}

    _run_guardrails(guardrails, message, position="input")
    response = await agent.invoke(message)

    assert response is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_multiple_guardrails_all_must_pass(skip_if_no_guardrails_api_key):
    from idun_agent_engine.core.config_builder import ConfigBuilder
    from idun_agent_engine.server.lifespan import _parse_guardrails
    from idun_agent_engine.server.routers.agent import _run_guardrails

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "Test Multiple Guardrails",
                "graph_definition": f"{mock_graph_path}:graph",
            },
        },
        "guardrails": {
            "input": [
                {
                    "config_id": "ban_list",
                    "api_key": os.getenv("GUARDRAILS_API_KEY"),
                    "guard_url": "hub://guardrails/ban_list",
                    "reject_message": "Banned word detected!",
                    "guard_params": {"banned_words": ["spam"]},
                },
                {
                    "config_id": "detect_pii",
                    "api_key": os.getenv("GUARDRAILS_API_KEY"),
                    "guard_url": "hub://guardrails/detect_pii",
                    "reject_message": "PII detected!",
                    "guard_params": {"pii_entities": ["EMAIL_ADDRESS"]},
                },
            ],
            "output": [],
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    guardrails = _parse_guardrails(engine_config.guardrails)

    # Banned word should be blocked
    with pytest.raises(HTTPException) as exc_info:
        _run_guardrails(
            guardrails,
            {"query": "This is spam content", "session_id": "test123"},
            position="input",
        )
    assert exc_info.value.status_code == 429

    # PII should be blocked
    with pytest.raises(HTTPException) as exc_info:
        _run_guardrails(
            guardrails,
            {"query": "Contact test@example.com", "session_id": "test123"},
            position="input",
        )
    assert exc_info.value.status_code == 429

    # Clean message should pass
    clean_message = "This is a clean message"
    message = {"query": clean_message, "session_id": "test123"}
    _run_guardrails(guardrails, message, position="input")
    response = await agent.invoke(message)
    assert response is not None
