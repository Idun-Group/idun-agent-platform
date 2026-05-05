"""Cross-cutting tests for the standalone namespace surface."""

from __future__ import annotations

import enum
import inspect
from datetime import UTC

from pydantic.alias_generators import to_camel

from idun_agent_schema import standalone
from idun_agent_schema.standalone._base import _CamelModel


def test_every_public_type_is_camel_model_or_strenum() -> None:
    """Every name re-exported from the standalone barrel must be a
    _CamelModel subclass, a StrEnum, or an explicitly allow-listed
    helper. Catches new modules that forget to inherit _CamelModel."""

    allowed_helpers: set[str] = set()  # extend if helpers are added later

    public_names = [
        name for name in dir(standalone) if not name.startswith("_")
    ]

    for name in public_names:
        if name in allowed_helpers:
            continue
        obj = getattr(standalone, name)
        if not inspect.isclass(obj):
            continue
        is_camel = issubclass(obj, _CamelModel) and obj is not _CamelModel
        is_strenum = issubclass(obj, enum.StrEnum)
        assert is_camel or is_strenum, (
            f"{name} must inherit _CamelModel or StrEnum; "
            f"got bases {[b.__name__ for b in obj.__bases__]}"
        )


def test_camel_model_round_trips_with_alias_and_field_name() -> None:
    """The shared _CamelModel base must accept both camelCase and
    snake_case keys on input, and emit camelCase on dump(by_alias=True)."""

    class _Sample(_CamelModel):
        first_name: str
        retry_count: int

    via_camel = _Sample.model_validate({"firstName": "ada", "retryCount": 3})
    via_snake = _Sample.model_validate({"first_name": "ada", "retry_count": 3})
    assert via_camel == via_snake

    dumped = via_camel.model_dump(by_alias=True)
    assert dumped == {"firstName": "ada", "retryCount": 3}


def test_envelope_round_trips_with_generic_payload() -> None:
    """StandaloneMutationResponse[StandaloneAgentRead] round-trips
    correctly with camelCase outbound and a nested reload field."""

    from datetime import datetime
    from uuid import uuid4

    from idun_agent_schema.engine.engine import EngineConfig
    from idun_agent_schema.manager.managed_agent import AgentStatus
    from idun_agent_schema.standalone import (
        StandaloneAgentRead,
        StandaloneMutationResponse,
        StandaloneReloadResult,
        StandaloneReloadStatus,
    )

    engine_config = EngineConfig.model_validate(
        {
            "agent": {
                "type": "LANGGRAPH",
                "config": {
                    "name": "ada",
                    "graph_definition": "agent.py:graph",
                },
            }
        }
    )
    agent = StandaloneAgentRead(
        id=uuid4(),
        slug="ada",
        name="Ada",
        description=None,
        version="1.0.0",
        status=AgentStatus.ACTIVE,
        base_url=None,
        base_engine_config=engine_config,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    reload = StandaloneReloadResult(
        status=StandaloneReloadStatus.RELOADED,
        message="Saved.",
    )
    envelope = StandaloneMutationResponse[StandaloneAgentRead](
        data=agent, reload=reload
    )

    dumped = envelope.model_dump(by_alias=True, mode="json")
    parsed = StandaloneMutationResponse[StandaloneAgentRead].model_validate(
        dumped
    )
    assert parsed.data.id == agent.id
    assert parsed.reload.status == StandaloneReloadStatus.RELOADED
    assert "data" in dumped and "reload" in dumped


def test_camel_alias_generator_is_idempotent() -> None:
    """Sanity-check that to_camel produces stable camelCase from the
    snake_case fields used across standalone schemas."""

    assert to_camel("agent_framework") == "agentFramework"
    assert to_camel("last_reloaded_at") == "lastReloadedAt"
    assert to_camel("name") == "name"
