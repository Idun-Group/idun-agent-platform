"""Tests for idun_agent_schema.standalone.common."""

from __future__ import annotations

from uuid import uuid4

from idun_agent_schema.standalone import (
    StandaloneDeleteResult,
    StandaloneMutationResponse,
    StandaloneReloadResult,
    StandaloneReloadStatus,
    StandaloneResourceIdentity,
    StandaloneSingletonDeleteResult,
)


def test_resource_identity_round_trip() -> None:
    rid = uuid4()
    parsed = StandaloneResourceIdentity.model_validate(
        {"id": str(rid), "slug": "ada", "name": "Ada"}
    )
    dumped = parsed.model_dump(by_alias=True, mode="json")
    reparsed = StandaloneResourceIdentity.model_validate(dumped)
    assert reparsed == parsed
    assert dumped["id"] == str(rid)


def test_delete_result_round_trip() -> None:
    rid = uuid4()
    parsed = StandaloneDeleteResult.model_validate(
        {"id": str(rid), "deleted": True}
    )
    dumped = parsed.model_dump(by_alias=True, mode="json")
    assert dumped == {"id": str(rid), "deleted": True}


def test_singleton_delete_result_round_trip() -> None:
    parsed = StandaloneSingletonDeleteResult.model_validate({"deleted": True})
    dumped = parsed.model_dump(by_alias=True)
    assert dumped == {"deleted": True}


def test_mutation_response_wraps_delete_result() -> None:
    rid = uuid4()
    envelope = StandaloneMutationResponse[StandaloneDeleteResult](
        data=StandaloneDeleteResult(id=rid),
        reload=StandaloneReloadResult(
            status=StandaloneReloadStatus.RELOADED,
            message="Removed and reloaded",
        ),
    )
    dumped = envelope.model_dump(by_alias=True, mode="json")
    assert dumped["data"]["deleted"] is True
    assert dumped["reload"]["status"] == "reloaded"
