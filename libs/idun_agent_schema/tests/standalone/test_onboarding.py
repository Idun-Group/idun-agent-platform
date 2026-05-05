"""Wire-shape tests for the onboarding schema."""

from __future__ import annotations

from idun_agent_schema.standalone import (
    CreateFromDetectionBody,
    CreateStarterBody,
    DetectedAgent,
    ScanResponse,
    ScanResult,
)


def test_detected_agent_camelcase_roundtrip() -> None:
    """Snake-case input + camelCase output by default."""
    agent = DetectedAgent(
        framework="LANGGRAPH",
        file_path="agent.py",
        variable_name="graph",
        inferred_name="My Agent",
        confidence="HIGH",
        source="config",
    )
    dumped = agent.model_dump(by_alias=True)
    assert dumped == {
        "framework": "LANGGRAPH",
        "filePath": "agent.py",
        "variableName": "graph",
        "inferredName": "My Agent",
        "confidence": "HIGH",
        "source": "config",
    }


def test_scan_result_camelcase_roundtrip() -> None:
    result = ScanResult(
        root="/tmp/x",
        detected=[],
        has_python_files=False,
        has_idun_config=False,
        scan_duration_ms=42,
    )
    dumped = result.model_dump(by_alias=True)
    assert dumped == {
        "root": "/tmp/x",
        "detected": [],
        "hasPythonFiles": False,
        "hasIdunConfig": False,
        "scanDurationMs": 42,
    }


def test_detected_agent_rejects_unknown_framework() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        DetectedAgent(
            framework="HAYSTACK",
            file_path="x.py",
            variable_name="x",
            inferred_name="X",
            confidence="HIGH",
            source="config",
        )


def test_scan_response_camel_case_serialization() -> None:
    response = ScanResponse(
        state="EMPTY",
        scan_result=ScanResult(
            root="/tmp/foo",
            detected=[],
            has_python_files=False,
            has_idun_config=False,
            scan_duration_ms=12,
        ),
        current_agent=None,
    )
    dumped = response.model_dump(by_alias=True)
    assert dumped["state"] == "EMPTY"
    assert dumped["scanResult"]["hasPythonFiles"] is False
    assert dumped["currentAgent"] is None


def test_scan_response_already_configured_carries_current_agent() -> None:
    """When state == ALREADY_CONFIGURED the UI needs the current agent payload."""
    response = ScanResponse.model_validate(
        {
            "state": "ALREADY_CONFIGURED",
            "scanResult": {
                "root": "/tmp/foo",
                "detected": [],
                "hasPythonFiles": True,
                "hasIdunConfig": False,
                "scanDurationMs": 0,
            },
            "currentAgent": None,
        }
    )
    assert response.state == "ALREADY_CONFIGURED"


def test_create_from_detection_body_accepts_camel_case() -> None:
    body = CreateFromDetectionBody.model_validate(
        {
            "framework": "LANGGRAPH",
            "filePath": "agent.py",
            "variableName": "graph",
        }
    )
    assert body.file_path == "agent.py"
    assert body.variable_name == "graph"


def test_create_from_detection_body_rejects_unknown_framework() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CreateFromDetectionBody(
            framework="HAYSTACK",  # type: ignore[arg-type]
            file_path="agent.py",
            variable_name="graph",
        )


def test_create_starter_body_default_name_is_none() -> None:
    body = CreateStarterBody(framework="LANGGRAPH")
    assert body.name is None


def test_create_starter_body_rejects_empty_name() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CreateStarterBody(framework="LANGGRAPH", name="")


def test_create_starter_body_rejects_overlong_name() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CreateStarterBody(framework="LANGGRAPH", name="x" * 81)
