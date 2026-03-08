"""Unit tests for engine_config service functions.

Tests assemble_engine_config and extract_resource_ids using lightweight
mock objects (no database). These functions operate on already-loaded
model attributes — no DB queries are needed.
"""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.engine_config import assemble_engine_config, extract_resource_ids

# Minimal valid EngineConfig bases (must pass Pydantic validation)
LANGGRAPH_BASE = {
    "server": {"api": {"port": 8000}},
    "agent": {
        "type": "LANGGRAPH",
        "config": {"name": "test-agent", "graph_definition": "mod:graph"},
    },
}

ADK_BASE = {
    "server": {"api": {"port": 8000}},
    "agent": {
        "type": "ADK",
        "config": {"name": "test-agent", "agent": "mod:agent", "app_name": "myapp"},
    },
}

# Valid resource configs matching engine Pydantic schemas
VALID_MEM_CHECKPOINTER = {"type": "postgres", "db_url": "postgresql://localhost/db"}
VALID_MEM_SESSION = {"type": "in_memory"}
VALID_SSO = {"enabled": True, "issuer": "https://accounts.google.com", "client_id": "cid"}
VALID_OBS = {
    "provider": "LANGFUSE",
    "config": {"host": "https://cloud.langfuse.com", "public_key": "pk", "secret_key": "sk"},
}
VALID_MCP = {"name": "github", "url": "http://mcp:8080"}
VALID_INTEG_DISCORD = {
    "provider": "DISCORD",
    "config": {"bot_token": "tok", "application_id": "aid", "public_key": "pk"},
}
VALID_INTEG_WHATSAPP = {
    "provider": "WHATSAPP",
    "config": {"access_token": "at", "phone_number_id": "123", "verify_token": "vt"},
}
VALID_GUARDRAIL = {"config_id": "ban_list", "banned_words": ["bad"]}


# ---------------------------------------------------------------------------
# Helpers — lightweight mock models that mimic loaded SQLAlchemy objects
# ---------------------------------------------------------------------------


def _mock_agent(
    engine_config: dict | None = None,
    *,
    memory=None,
    memory_id=None,
    sso=None,
    sso_id=None,
    guardrail_associations=None,
    mcp_server_associations=None,
    observability_associations=None,
    integration_associations=None,
):
    """Build a mock ManagedAgentModel-like object with loaded relationships."""
    import copy

    if engine_config is None:
        engine_config = copy.deepcopy(LANGGRAPH_BASE)
    return SimpleNamespace(
        id=uuid4(),
        engine_config=engine_config,
        memory_id=memory_id,
        memory=memory,
        sso_id=sso_id,
        sso=sso,
        guardrail_associations=guardrail_associations or [],
        mcp_server_associations=mcp_server_associations or [],
        observability_associations=observability_associations or [],
        integration_associations=integration_associations or [],
    )


def _mock_guardrail_assoc(guardrail_config, position="input", sort_order=0):
    guardrail_id = uuid4()
    return SimpleNamespace(
        guardrail_id=guardrail_id,
        position=position,
        sort_order=sort_order,
        guardrail=SimpleNamespace(guardrail_config=guardrail_config),
    )


def _mock_mcp_assoc(mcp_config):
    mcp_id = uuid4()
    return SimpleNamespace(
        mcp_server_id=mcp_id,
        mcp_server=SimpleNamespace(mcp_server_config=mcp_config),
    )


def _mock_obs_assoc(obs_config):
    obs_id = uuid4()
    return SimpleNamespace(
        observability_id=obs_id,
        observability=SimpleNamespace(observability_config=obs_config),
    )


def _mock_integ_assoc(integ_config):
    integ_id = uuid4()
    return SimpleNamespace(
        integration_id=integ_id,
        integration=SimpleNamespace(integration_config=integ_config),
    )


# ---------------------------------------------------------------------------
# Tests: assemble_engine_config
# ---------------------------------------------------------------------------


class TestAssembleEngineConfig:
    """Test assemble_engine_config() produces correct EngineConfig dict."""

    def test_bare_agent_no_resources(self):
        agent = _mock_agent(LANGGRAPH_BASE)
        result = assemble_engine_config(agent)

        assert result["server"]["api"]["port"] == 8000
        assert result["agent"]["type"] == "LANGGRAPH"
        # Default in-memory checkpointer is always injected for LangGraph
        assert result["agent"]["config"]["checkpointer"] == {"type": "memory"}
        assert "guardrails" not in result
        assert "mcp_servers" not in result
        assert "observability" not in result
        assert "sso" not in result
        assert "integrations" not in result

    def test_bare_adk_agent_gets_default_session_service(self):
        import copy

        agent = _mock_agent(copy.deepcopy(ADK_BASE))
        result = assemble_engine_config(agent)

        assert result["agent"]["config"]["session_service"] == {"type": "in_memory"}
        assert "checkpointer" not in result["agent"]["config"]

    def test_memory_langgraph_injects_checkpointer(self):
        import copy

        mem = SimpleNamespace(memory_config=VALID_MEM_CHECKPOINTER)
        mem_id = uuid4()

        base = copy.deepcopy(LANGGRAPH_BASE)
        agent = _mock_agent(base, memory=mem, memory_id=mem_id)
        result = assemble_engine_config(agent)

        assert result["agent"]["config"]["checkpointer"] == VALID_MEM_CHECKPOINTER
        assert "session_service" not in result["agent"]["config"]

    def test_memory_adk_injects_session_service(self):
        import copy

        mem = SimpleNamespace(memory_config=VALID_MEM_SESSION)
        mem_id = uuid4()

        base = copy.deepcopy(ADK_BASE)
        agent = _mock_agent(base, memory=mem, memory_id=mem_id)
        result = assemble_engine_config(agent)

        assert result["agent"]["config"]["session_service"] == VALID_MEM_SESSION
        assert "checkpointer" not in result["agent"]["config"]

    def test_no_memory_replaces_stale_checkpointer_with_default(self):
        import copy

        base = copy.deepcopy(LANGGRAPH_BASE)
        base["agent"]["config"]["checkpointer"] = {"stale": True}

        agent = _mock_agent(base)
        result = assemble_engine_config(agent)
        assert result["agent"]["config"]["checkpointer"] == {"type": "memory"}

    def test_no_memory_replaces_stale_session_service_with_default(self):
        import copy

        base = copy.deepcopy(ADK_BASE)
        base["agent"]["config"]["session_service"] = {"stale": True}

        agent = _mock_agent(base)
        result = assemble_engine_config(agent)
        assert result["agent"]["config"]["session_service"] == {"type": "in_memory"}

    def test_guardrails_split_by_position(self, monkeypatch):
        monkeypatch.setenv("GUARDRAILS_API_KEY", "test-key")

        g_in = _mock_guardrail_assoc(
            {"config_id": "ban_list", "banned_words": ["bad"]},
            position="input",
            sort_order=0,
        )
        g_out = _mock_guardrail_assoc(
            {"config_id": "toxic_language", "threshold": 0.5},
            position="output",
            sort_order=0,
        )
        agent = _mock_agent(
            LANGGRAPH_BASE,
            guardrail_associations=[g_in, g_out],
        )
        result = assemble_engine_config(agent)

        assert "guardrails" in result
        guards = result["guardrails"]
        assert len(guards.get("input", [])) == 1
        assert len(guards.get("output", [])) == 1

    def test_guardrails_sorted_by_sort_order(self, monkeypatch):
        monkeypatch.setenv("GUARDRAILS_API_KEY", "test-key")

        g2 = _mock_guardrail_assoc(
            {"config_id": "ban_list", "banned_words": ["second"]},
            position="input",
            sort_order=1,
        )
        g1 = _mock_guardrail_assoc(
            {"config_id": "ban_list", "banned_words": ["first"]},
            position="input",
            sort_order=0,
        )
        # Intentionally out of order in the list
        agent = _mock_agent(
            LANGGRAPH_BASE,
            guardrail_associations=[g2, g1],
        )
        result = assemble_engine_config(agent)

        input_guards = result["guardrails"]["input"]
        assert len(input_guards) == 2
        # g1 (sort_order=0) should be first
        assert input_guards[0]["guard_params"]["banned_words"] == ["first"]
        assert input_guards[1]["guard_params"]["banned_words"] == ["second"]

    def test_no_guardrails_removes_key(self):
        import copy

        base = copy.deepcopy(LANGGRAPH_BASE)
        base["guardrails"] = {"input": [{"stale": True}], "output": []}

        agent = _mock_agent(base)
        result = assemble_engine_config(agent)
        assert "guardrails" not in result

    def test_mcp_servers_assembled(self):
        mcp1 = _mock_mcp_assoc({"name": "github", "url": "http://mcp:8080"})
        mcp2 = _mock_mcp_assoc({"name": "slack", "url": "http://mcp:8081"})
        agent = _mock_agent(
            LANGGRAPH_BASE,
            mcp_server_associations=[mcp1, mcp2],
        )
        result = assemble_engine_config(agent)

        assert len(result["mcp_servers"]) == 2
        names = {s["name"] for s in result["mcp_servers"]}
        assert names == {"github", "slack"}

    def test_no_mcp_removes_key(self):
        import copy

        base = copy.deepcopy(LANGGRAPH_BASE)
        base["mcp_servers"] = [{"stale": True}]

        agent = _mock_agent(base)
        result = assemble_engine_config(agent)
        assert "mcp_servers" not in result

    def test_no_mcp_removes_camelcase_key(self):
        import copy

        base = copy.deepcopy(LANGGRAPH_BASE)
        base["mcpServers"] = [{"stale": True}]

        agent = _mock_agent(base)
        result = assemble_engine_config(agent)
        assert "mcpServers" not in result

    def test_observability_assembled(self):
        obs = _mock_obs_assoc(VALID_OBS)
        agent = _mock_agent(
            LANGGRAPH_BASE,
            observability_associations=[obs],
        )
        result = assemble_engine_config(agent)
        assert len(result["observability"]) == 1
        assert result["observability"][0]["provider"] == "LANGFUSE"

    def test_sso_assembled(self):
        sso = SimpleNamespace(sso_config=VALID_SSO)
        sso_id = uuid4()

        agent = _mock_agent(LANGGRAPH_BASE, sso=sso, sso_id=sso_id)
        result = assemble_engine_config(agent)
        assert result["sso"]["issuer"] == "https://accounts.google.com"
        assert result["sso"]["client_id"] == "cid"

    def test_no_sso_removes_key(self):
        import copy

        base = copy.deepcopy(LANGGRAPH_BASE)
        base["sso"] = {"stale": True}

        agent = _mock_agent(base)
        result = assemble_engine_config(agent)
        assert "sso" not in result

    def test_integrations_assembled(self):
        integ = _mock_integ_assoc(VALID_INTEG_WHATSAPP)
        agent = _mock_agent(
            LANGGRAPH_BASE,
            integration_associations=[integ],
        )
        result = assemble_engine_config(agent)
        assert len(result["integrations"]) == 1
        assert result["integrations"][0]["provider"] == "WHATSAPP"

    def test_all_resources_together(self, monkeypatch):
        """Full assembly with every resource type populated."""
        import copy

        monkeypatch.setenv("GUARDRAILS_API_KEY", "test-key")

        mem = SimpleNamespace(memory_config=VALID_MEM_CHECKPOINTER)
        mem_id = uuid4()

        sso = SimpleNamespace(sso_config=VALID_SSO)
        sso_id = uuid4()

        base = copy.deepcopy(LANGGRAPH_BASE)

        agent = _mock_agent(
            base,
            memory=mem,
            memory_id=mem_id,
            sso=sso,
            sso_id=sso_id,
            guardrail_associations=[
                _mock_guardrail_assoc(VALID_GUARDRAIL)
            ],
            mcp_server_associations=[
                _mock_mcp_assoc(VALID_MCP)
            ],
            observability_associations=[
                _mock_obs_assoc(VALID_OBS)
            ],
            integration_associations=[
                _mock_integ_assoc(VALID_INTEG_DISCORD)
            ],
        )
        result = assemble_engine_config(agent)

        assert result["agent"]["config"]["checkpointer"] == VALID_MEM_CHECKPOINTER
        assert result["sso"]["issuer"] == VALID_SSO["issuer"]
        assert "guardrails" in result
        assert len(result["mcp_servers"]) == 1
        assert len(result["observability"]) == 1
        assert len(result["integrations"]) == 1


# ---------------------------------------------------------------------------
# Tests: extract_resource_ids
# ---------------------------------------------------------------------------


class TestExtractResourceIds:
    """Test extract_resource_ids() returns correct IDs from loaded model."""

    def test_empty_agent(self):
        agent = _mock_agent(LANGGRAPH_BASE)
        ids = extract_resource_ids(agent)

        assert ids.memory_id is None
        assert ids.sso_id is None
        assert ids.guardrail_ids == []
        assert ids.mcp_server_ids == []
        assert ids.observability_ids == []
        assert ids.integration_ids == []

    def test_returns_empty_lists_not_none(self):
        """Phase 5 fix: empty associations return [] not None."""
        agent = _mock_agent(LANGGRAPH_BASE)
        ids = extract_resource_ids(agent)

        assert ids.guardrail_ids is not None
        assert ids.mcp_server_ids is not None
        assert ids.observability_ids is not None
        assert ids.integration_ids is not None
        assert isinstance(ids.guardrail_ids, list)

    def test_extracts_all_resource_types(self):
        mem_id = uuid4()
        sso_id = uuid4()
        guard_id = uuid4()
        mcp_id = uuid4()
        obs_id = uuid4()
        integ_id = uuid4()

        agent = SimpleNamespace(
            memory_id=mem_id,
            sso_id=sso_id,
            guardrail_associations=[
                SimpleNamespace(
                    guardrail_id=guard_id, position="output", sort_order=2
                )
            ],
            mcp_server_associations=[SimpleNamespace(mcp_server_id=mcp_id)],
            observability_associations=[
                SimpleNamespace(observability_id=obs_id)
            ],
            integration_associations=[SimpleNamespace(integration_id=integ_id)],
        )
        ids = extract_resource_ids(agent)

        assert ids.memory_id == mem_id
        assert ids.sso_id == sso_id
        assert len(ids.guardrail_ids) == 1
        assert ids.guardrail_ids[0].id == guard_id
        assert ids.guardrail_ids[0].position == "output"
        assert ids.guardrail_ids[0].sort_order == 2
        assert ids.mcp_server_ids == [mcp_id]
        assert ids.observability_ids == [obs_id]
        assert ids.integration_ids == [integ_id]

    def test_multiple_guardrails_preserved(self):
        g1_id, g2_id = uuid4(), uuid4()
        agent = SimpleNamespace(
            memory_id=None,
            sso_id=None,
            guardrail_associations=[
                SimpleNamespace(guardrail_id=g1_id, position="input", sort_order=0),
                SimpleNamespace(guardrail_id=g2_id, position="output", sort_order=1),
            ],
            mcp_server_associations=[],
            observability_associations=[],
            integration_associations=[],
        )
        ids = extract_resource_ids(agent)

        assert len(ids.guardrail_ids) == 2
        positions = {g.position for g in ids.guardrail_ids}
        assert positions == {"input", "output"}
