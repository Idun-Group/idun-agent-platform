"""Unit tests for the ADK → OpenInference attribute projection helper.

Source-of-truth for the rule table:
``~/Documents/GitHub/idun-dev/tasks/engine-adk-openinference-projection-10-05-2026/SPEC.md``
§ 4. Each test below pins one row of that table.
"""

from __future__ import annotations

from idun_agent_engine.observability.projection import project_to_openinference


def test_call_llm_full_projection() -> None:
    """ADK call_llm with full gen_ai.* coverage projects onto OpenInference."""
    src = {
        "gen_ai.system": "gcp.vertex.agent",
        "gen_ai.request.model": "gemini-2.5-flash",
        "gen_ai.usage.input_tokens": 756,
        "gen_ai.usage.output_tokens": 11,
        "gen_ai.response.finish_reasons": ["stop"],
        "gcp.vertex.agent.llm_request": '{"messages": [{"role": "user"}]}',
        "gcp.vertex.agent.llm_response": '{"content": {"parts": []}}',
    }
    out = project_to_openinference(src, span_name="call_llm")

    assert out["openinference.span.kind"] == "LLM"
    assert out["llm.system"] == "gcp.vertex.agent"
    assert out["llm.provider"] == "google"
    assert out["llm.model_name"] == "gemini-2.5-flash"
    assert out["llm.token_count.prompt"] == 756
    assert out["llm.token_count.completion"] == 11
    assert out["llm.token_count.total"] == 767
    assert out["llm.finish_reason"] == "stop"
    assert out["input.value"] == '{"messages": [{"role": "user"}]}'
    assert out["input.mime_type"] == "application/json"
    assert out["output.value"] == '{"content": {"parts": []}}'
    assert out["output.mime_type"] == "application/json"

    for key, value in src.items():
        assert out[key] == value


def test_call_llm_minimal_projection() -> None:
    """Only the keys present in the source are projected; rest absent."""
    src = {
        "gen_ai.request.model": "gemini-2.5-flash",
        "gen_ai.usage.input_tokens": 50,
    }
    out = project_to_openinference(src, span_name="call_llm")

    assert out["openinference.span.kind"] == "LLM"
    assert out["llm.model_name"] == "gemini-2.5-flash"
    assert out["llm.token_count.prompt"] == 50
    assert "llm.token_count.completion" not in out
    assert "llm.token_count.total" not in out
    assert "llm.finish_reason" not in out
    assert "input.value" not in out
    assert "output.value" not in out


def test_invoke_agent_projection() -> None:
    """invoke_agent <X> projects to AGENT, source keys preserved."""
    src = {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": "planner_node",
        "gen_ai.agent.description": "Plans things",
        "gen_ai.conversation.id": "abc-123",
    }
    out = project_to_openinference(src, span_name="invoke_agent planner_node")

    assert out["openinference.span.kind"] == "AGENT"
    assert out["gen_ai.agent.name"] == "planner_node"
    assert out["gen_ai.agent.description"] == "Plans things"
    assert out["gen_ai.conversation.id"] == "abc-123"


def test_execute_tool_projection() -> None:
    """execute_tool <X> projects to TOOL with name + parameters + output."""
    src = {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "transfer_to_agent",
        "gcp.vertex.agent.tool_call_args": '{"agent_name": "planner_node"}',
        "gcp.vertex.agent.tool_response": '{"status": "success"}',
    }
    out = project_to_openinference(
        src, span_name="execute_tool transfer_to_agent"
    )

    assert out["openinference.span.kind"] == "TOOL"
    assert out["tool.name"] == "transfer_to_agent"
    assert out["tool.parameters"] == '{"agent_name": "planner_node"}'
    assert out["output.value"] == '{"status": "success"}'
    assert out["output.mime_type"] == "application/json"
    assert out["gen_ai.tool.name"] == "transfer_to_agent"


def test_already_projected_passthrough() -> None:
    """LangGraph spans (already OpenInference-shaped) pass through unchanged."""
    src = {
        "openinference.span.kind": "LLM",
        "llm.model_name": "gpt-4o",
        "llm.token_count.prompt": 100,
        "llm.token_count.completion": 50,
    }
    out = project_to_openinference(src, span_name="ChatOpenAI")

    assert out == src


def test_unknown_span_passthrough() -> None:
    """Spans with no recognised shape are returned unchanged."""
    src = {"some.random.key": "value"}
    out = project_to_openinference(src, span_name="random.span")

    assert out == src


def test_provider_normalisation_gcp() -> None:
    """gcp.vertex.agent → google for llm.provider; llm.system preserved."""
    src = {"gen_ai.system": "gcp.vertex.agent"}
    out = project_to_openinference(src, span_name="call_llm")

    assert out["llm.system"] == "gcp.vertex.agent"
    assert out["llm.provider"] == "google"


def test_provider_normalisation_passthrough_unknown() -> None:
    """Unknown gen_ai.system falls through to identity for llm.provider."""
    src = {"gen_ai.system": "weird.new.system"}
    out = project_to_openinference(src, span_name="call_llm")

    assert out["llm.system"] == "weird.new.system"
    assert out["llm.provider"] == "weird.new.system"


def test_finish_reason_first_element() -> None:
    """First element of finish_reasons becomes llm.finish_reason."""
    src = {"gen_ai.response.finish_reasons": ["stop", "length"]}
    out = project_to_openinference(src, span_name="call_llm")

    assert out["llm.finish_reason"] == "stop"


def test_finish_reason_omitted_when_empty() -> None:
    """Empty finish_reasons list produces no llm.finish_reason."""
    src = {"gen_ai.response.finish_reasons": []}
    out = project_to_openinference(src, span_name="call_llm")

    assert "llm.finish_reason" not in out


def test_token_count_total_omitted_when_partial() -> None:
    """Total absent when only prompt or only completion is present."""
    src = {"gen_ai.usage.input_tokens": 10}
    out = project_to_openinference(src, span_name="call_llm")

    assert out["llm.token_count.prompt"] == 10
    assert "llm.token_count.completion" not in out
    assert "llm.token_count.total" not in out


def test_operation_name_discriminator_wins_over_prefix() -> None:
    """gen_ai.operation.name takes precedence over span name prefix."""
    src = {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "weird_tool",
    }
    out = project_to_openinference(src, span_name="call_llm")

    assert out["openinference.span.kind"] == "TOOL"
    assert out["tool.name"] == "weird_tool"


def test_existing_openinference_keys_not_overwritten() -> None:
    """Existing OI keys in the source survive the projection."""
    src = {
        "llm.model_name": "explicit-model",
        "gen_ai.request.model": "from-gen-ai",
        "gen_ai.system": "gcp.vertex.agent",
    }
    out = project_to_openinference(src, span_name="call_llm")

    assert out["llm.model_name"] == "explicit-model"
    assert out["openinference.span.kind"] == "LLM"


def test_llm_input_value_only_set_when_request_present() -> None:
    """input.mime_type is not set when input.value is absent."""
    src = {"gen_ai.request.model": "gpt-4o"}
    out = project_to_openinference(src, span_name="call_llm")

    assert "input.value" not in out
    assert "input.mime_type" not in out
