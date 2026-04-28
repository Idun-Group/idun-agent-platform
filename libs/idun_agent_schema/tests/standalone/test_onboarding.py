"""Wire-shape tests for the onboarding schema."""

from __future__ import annotations

from idun_agent_schema.standalone import DetectedAgent, ScanResult


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
