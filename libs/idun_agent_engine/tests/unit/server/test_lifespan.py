"""Tests for FastAPI lifespan management."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from idun_agent_engine.core.engine_config import EngineConfig
from idun_agent_engine.server.lifespan import (
    FailedGuardrail,
    _parse_guardrails,
    lifespan,
)


@pytest.mark.unit
class TestLifespan:
    """Test app lifespan startup and shutdown."""

    async def test_lifespan_initializes_and_closes_agent(self, tmp_path):
        """Lifespan initializes agent on startup and closes on shutdown."""
        config_data = {
            "server": {"api": {"port": 8000}},
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "Lifecycle Agent",
                    "graph_definition": "./agent.py:graph",
                    "observability": {
                        "provider": "langfuse",
                        "enabled": True,
                        "options": {"run_name": "test-lifecycle"},
                    },
                },
            },
        }

        engine_config = EngineConfig.model_validate(config_data)

        app = MagicMock()
        app.state.engine_config = engine_config

        mock_agent = MagicMock()
        mock_agent.name = "Lifecycle Agent"
        mock_agent.close = AsyncMock()

        with patch(
            "idun_agent_engine.core.config_builder.ConfigBuilder.initialize_agent_from_config"
        ) as mock_init:
            mock_init.return_value = mock_agent

            async with lifespan(app):
                # During lifespan, agent should be initialized
                assert app.state.agent == mock_agent
                assert app.state.config == engine_config
                mock_init.assert_called_once()
                call_args = mock_init.call_args
                assert call_args[0][0] is engine_config

            # After lifespan exits, agent should be closed AND awaited.
            # assert_awaited_once also catches the regression where the
            # coroutine is called but not awaited — exactly the bug class
            # the AsyncMock-vs-MagicMock split in this fixture guards against.
            mock_agent.close.assert_awaited_once()


@pytest.mark.unit
class TestParseGuardrailsFailures:
    """``_parse_guardrails`` returns successes + per-guard failures.

    Hub install errors (401 from the hub URL, missing transitive deps
    like presidio-analyzer / spaCy models) used to be silently logged
    and dropped — the engine continued booting / reloading and the
    admin saw success while the guardrail was inactive. Now failures
    are collected and surfaced to ``app.state.failed_guardrails`` so
    the standalone reload pipeline can roll back on regression.
    """

    def test_returns_failures_when_guard_init_raises(self):
        guardrails_obj = MagicMock()
        guardrails_obj.input = [
            MagicMock(config_id="BAN_LIST"),
            MagicMock(config_id="DETECT_PII"),
        ]
        guardrails_obj.output = []

        with patch(
            "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard"
        ) as mock_guard_cls:
            # First instance raises (simulates Hub 401 / dep-missing);
            # second instance succeeds.
            instance_ok = MagicMock()
            mock_guard_cls.side_effect = [
                RuntimeError("hub install failed: 401"),
                instance_ok,
            ]

            guards, failures = _parse_guardrails(guardrails_obj)

        assert guards == [instance_ok]
        assert failures == [
            FailedGuardrail(
                config_id="BAN_LIST",
                position="input",
                error="hub install failed: 401",
            )
        ]

    def test_returns_empty_failures_on_clean_init(self):
        guardrails_obj = MagicMock()
        guardrails_obj.input = [MagicMock(config_id="BAN_LIST")]
        guardrails_obj.output = []

        with patch(
            "idun_agent_engine.guardrails.guardrails_hub.guardrails_hub.GuardrailsHubGuard"
        ) as mock_guard_cls:
            mock_guard_cls.return_value = MagicMock()

            guards, failures = _parse_guardrails(guardrails_obj)

        assert len(guards) == 1
        assert failures == []

    def test_returns_empty_for_empty_guardrails(self):
        guards, failures = _parse_guardrails(None)
        assert guards == []
        assert failures == []
