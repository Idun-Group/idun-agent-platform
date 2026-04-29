"""Unit tests for the onboarding service helpers."""

from __future__ import annotations

from idun_agent_schema.standalone import DetectedAgent, ScanResult
from idun_agent_standalone.services import onboarding


def _scan_result(
    *,
    detected: list[DetectedAgent] | None = None,
    has_python_files: bool = False,
    has_idun_config: bool = False,
) -> ScanResult:
    return ScanResult(
        root="/tmp",
        detected=detected or [],
        has_python_files=has_python_files,
        has_idun_config=has_idun_config,
        scan_duration_ms=0,
    )


def _det(framework: str = "LANGGRAPH", *, name: str = "Agent") -> DetectedAgent:
    return DetectedAgent(
        framework=framework,  # type: ignore[arg-type]
        file_path="agent.py",
        variable_name="graph" if framework == "LANGGRAPH" else "agent",
        inferred_name=name,
        confidence="HIGH",
        source="source",
    )


def test_classify_state_already_configured_short_circuits() -> None:
    """Agent row trumps everything else."""
    state = onboarding.classify_state(
        _scan_result(detected=[_det()]), agent_row_exists=True
    )
    assert state == "ALREADY_CONFIGURED"


def test_classify_state_empty() -> None:
    state = onboarding.classify_state(_scan_result(), agent_row_exists=False)
    assert state == "EMPTY"


def test_classify_state_no_supported() -> None:
    state = onboarding.classify_state(
        _scan_result(has_python_files=True), agent_row_exists=False
    )
    assert state == "NO_SUPPORTED"


def test_classify_state_one_detected() -> None:
    state = onboarding.classify_state(
        _scan_result(detected=[_det()], has_python_files=True),
        agent_row_exists=False,
    )
    assert state == "ONE_DETECTED"


def test_classify_state_many_detected() -> None:
    state = onboarding.classify_state(
        _scan_result(
            detected=[_det(name="A"), _det(name="B")],
            has_python_files=True,
        ),
        agent_row_exists=False,
    )
    assert state == "MANY_DETECTED"


def test_engine_config_for_langgraph_detection() -> None:
    detection = _det(framework="LANGGRAPH", name="My Agent")
    config_dict = onboarding.engine_config_dict_from_detection(detection)
    assert config_dict["agent"]["type"] == "LANGGRAPH"
    assert config_dict["agent"]["config"]["graph_definition"] == "agent.py:graph"
    # Names that hit the engine config must be slugified — engine ADK validator
    # derives app_name from name, and arbitrary unicode breaks downstream.
    assert config_dict["agent"]["config"]["name"]


def test_engine_config_for_adk_detection() -> None:
    detection = _det(framework="ADK", name="My Agent")
    config_dict = onboarding.engine_config_dict_from_detection(detection)
    assert config_dict["agent"]["type"] == "ADK"
    assert config_dict["agent"]["config"]["agent"] == "agent.py:agent"
    assert config_dict["agent"]["config"]["name"]


def test_engine_config_for_starter_langgraph() -> None:
    config_dict = onboarding.engine_config_dict_for_starter(
        framework="LANGGRAPH", name="Starter Agent"
    )
    assert config_dict["agent"]["type"] == "LANGGRAPH"
    assert config_dict["agent"]["config"]["graph_definition"] == "agent.py:graph"


def test_engine_config_for_starter_adk() -> None:
    config_dict = onboarding.engine_config_dict_for_starter(
        framework="ADK", name="Starter Agent"
    )
    assert config_dict["agent"]["type"] == "ADK"
    assert config_dict["agent"]["config"]["agent"] == "agent.py:agent"


def test_engine_config_passes_engine_validation_langgraph() -> None:
    """The dict we hand to StandaloneAgentRow.base_engine_config must validate."""
    from idun_agent_schema.engine import EngineConfig

    detection = _det(framework="LANGGRAPH", name="Foo")
    EngineConfig.model_validate(onboarding.engine_config_dict_from_detection(detection))


def test_engine_config_passes_engine_validation_adk() -> None:
    from idun_agent_schema.engine import EngineConfig

    detection = _det(framework="ADK", name="Foo")
    EngineConfig.model_validate(onboarding.engine_config_dict_from_detection(detection))
