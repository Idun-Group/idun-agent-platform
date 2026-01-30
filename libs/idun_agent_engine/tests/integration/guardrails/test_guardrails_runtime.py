import os
from pathlib import Path

import pytest


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
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    guardrails = _parse_guardrails(engine_config.guardrails)

    banned_message = "This message contains a badword in it"
    message = {"query": banned_message, "session_id": "test123"}

    try:
        _run_guardrails(guardrails, message, position="input")
        response = await agent.invoke(message)
        assert False, "Expected guardrail to block the message but it passed"
    except Exception as e:
        error_message = str(e)
        assert (
            "banned words" in error_message.lower()
            or "badword" in error_message.lower()
        )


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
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    guardrails = _parse_guardrails(engine_config.guardrails)

    message_with_email = "Please contact me at user@example.com for more info"
    message = {"query": message_with_email, "session_id": "test123"}

    try:
        _run_guardrails(guardrails, message, position="input")
        response = await agent.invoke(message)
        assert False, "Expected PII guardrail to block email but it passed"
    except Exception as e:
        error_message = str(e)
        assert "pii" in error_message.lower() or "email" in error_message.lower()


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

    message_with_banned_word = "This is spam content"
    message_with_pii = "Contact test@example.com"
    clean_message = "This is a clean message"

    try:
        _run_guardrails(guardrails, {"query": message_with_banned_word, "session_id": "test123"}, position="input")
        await agent.invoke({"query": message_with_banned_word, "session_id": "test123"})
        assert False, "Expected ban_list guardrail to block spam"
    except Exception:
        pass

    try:
        _run_guardrails(guardrails, {"query": message_with_pii, "session_id": "test123"}, position="input")
        await agent.invoke({"query": message_with_pii, "session_id": "test123"})
        assert False, "Expected PII guardrail to block email"
    except Exception:
        pass

    message = {"query": clean_message, "session_id": "test123"}
    _run_guardrails(guardrails, message, position="input")
    response = await agent.invoke(message)
    assert response is not None
