"""Tests for idun_agent_schema.standalone.enrollment."""

from __future__ import annotations

from uuid import uuid4

from idun_agent_schema.standalone import (
    StandaloneEnrollmentInfo,
    StandaloneEnrollmentMode,
    StandaloneEnrollmentStatus,
)


def test_enrollment_mode_values() -> None:
    expected = {"local", "enrolled", "managed"}
    actual = {member.value for member in StandaloneEnrollmentMode}
    assert actual == expected


def test_enrollment_status_values() -> None:
    expected = {"not_enrolled", "pending", "connected", "error"}
    actual = {member.value for member in StandaloneEnrollmentStatus}
    assert actual == expected


def test_enrollment_info_default_local_not_enrolled() -> None:
    info = StandaloneEnrollmentInfo()
    assert info.mode == StandaloneEnrollmentMode.LOCAL
    assert info.status == StandaloneEnrollmentStatus.NOT_ENROLLED
    assert info.manager_url is None
    assert info.workspace_id is None
    assert info.managed_agent_id is None
    assert info.config_revision is None


def test_enrollment_info_round_trip_connected() -> None:
    workspace_id = uuid4()
    managed_agent_id = uuid4()
    info = StandaloneEnrollmentInfo(
        mode=StandaloneEnrollmentMode.ENROLLED,
        status=StandaloneEnrollmentStatus.CONNECTED,
        manager_url="https://hub.example.com",
        workspace_id=workspace_id,
        managed_agent_id=managed_agent_id,
        config_revision=42,
    )
    dumped = info.model_dump(by_alias=True, mode="json")
    assert dumped["mode"] == "enrolled"
    assert dumped["status"] == "connected"
    assert dumped["managerUrl"] == "https://hub.example.com"
    assert dumped["managedAgentId"] == str(managed_agent_id)
    assert dumped["configRevision"] == 42
    reparsed = StandaloneEnrollmentInfo.model_validate(dumped)
    assert reparsed == info


def test_enrollment_info_snake_case_inbound() -> None:
    info = StandaloneEnrollmentInfo.model_validate(
        {
            "mode": "enrolled",
            "status": "pending",
            "manager_url": "https://hub.example.com",
            "config_revision": 1,
        }
    )
    assert info.mode == StandaloneEnrollmentMode.ENROLLED
    assert info.status == StandaloneEnrollmentStatus.PENDING
    assert info.manager_url == "https://hub.example.com"
