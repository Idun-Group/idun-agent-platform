"""Unit tests for classify_reload_error."""
from __future__ import annotations

from idun_agent_schema.standalone import StandaloneErrorCode
from idun_agent_standalone.services.error_classifier import (
    ReloadFailureCode,
    classify_reload_error,
)


def _engine_config_stub():
    """Stub engine config: only the attributes accessed by the classifier."""
    class _M:
        class _C:
            db_url = "postgresql://localhost:5432/agent"
        config = _C()
    class _O:
        class _C:
            host = "https://cloud.langfuse.com"
        config = _C()
    class _Cfg:
        memory = _M()
        observability = [_O()]
    return _Cfg()


def test_import_error_maps_to_graph_definition() -> None:
    err = classify_reload_error(
        ImportError("no module named 'foo'"), _engine_config_stub()
    )
    assert err.code == StandaloneErrorCode.RELOAD_FAILED
    assert any(
        fe.field == "agent.config.graphDefinition"
        and fe.code == ReloadFailureCode.IMPORT_ERROR.value
        for fe in (err.field_errors or [])
    )


def test_postgres_connection_error_maps_to_memory_db_url() -> None:
    err = classify_reload_error(
        ConnectionError("could not connect to server postgresql://localhost:5432"),
        _engine_config_stub(),
    )
    assert any(
        fe.field == "memory.config.dbUrl"
        and fe.code == ReloadFailureCode.CONNECTION_ERROR.value
        for fe in (err.field_errors or [])
    )


def test_keyerror_for_env_var_lands_in_details() -> None:
    err = classify_reload_error(
        KeyError("OPENAI_API_KEY"), _engine_config_stub()
    )
    assert err.field_errors == [] or err.field_errors is None
    assert err.details is not None
    assert err.details.get("envVar") == "OPENAI_API_KEY"
    assert "OPENAI_API_KEY" in err.message


def test_unknown_exception_falls_through() -> None:
    err = classify_reload_error(
        RuntimeError("mystery"), _engine_config_stub()
    )
    assert (err.field_errors or []) == []
    assert "mystery" in err.message
