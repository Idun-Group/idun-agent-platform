"""Unit tests for connection check service."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from idun_agent_schema.engine.observability_v2 import (
    LangfuseConfig,
    LangsmithConfig,
    ObservabilityConfig,
    ObservabilityProvider,
    PhoenixConfig,
)

from app.services.connection_check import (
    check_memory,
    check_observability,
)


@pytest.mark.asyncio
class TestCheckObservability:
    async def test_langfuse_success(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.LANGFUSE,
            enabled=True,
            config=LangfuseConfig(
                host="https://cloud.langfuse.com",
                public_key="pk-lf-test",
                secret_key="sk-lf-test",
            ),
        )
        mock_resp = MagicMock(status_code=207)
        with patch("app.services.connection_check.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await check_observability(config)

        assert result.success is True
        assert result.provider == "LANGFUSE"

    async def test_langfuse_missing_keys(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.LANGFUSE,
            enabled=True,
            config=LangfuseConfig(host="https://cloud.langfuse.com"),
        )
        result = await check_observability(config)
        assert result.success is False
        assert "required" in result.message.lower()

    async def test_langsmith_success(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.LANGSMITH,
            enabled=True,
            config=LangsmithConfig(api_key="lsv2_test"),
        )
        mock_resp = MagicMock(status_code=200)
        with patch("app.services.connection_check.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await check_observability(config)

        assert result.success is True
        assert result.provider == "LANGSMITH"

    async def test_langsmith_missing_key(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.LANGSMITH,
            enabled=True,
            config=LangsmithConfig(),
        )
        result = await check_observability(config)
        assert result.success is False
        assert "required" in result.message.lower()

    async def test_phoenix_success(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.PHOENIX,
            enabled=True,
            config=PhoenixConfig(collector_endpoint="http://localhost:6006"),
        )
        mock_resp = MagicMock(status_code=200)
        with patch("app.services.connection_check.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await check_observability(config)

        assert result.success is True
        assert result.provider == "PHOENIX"

    async def test_phoenix_missing_endpoint(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.PHOENIX,
            enabled=True,
            config=PhoenixConfig(collector_endpoint=""),
        )
        result = await check_observability(config)
        assert result.success is False
        assert "required" in result.message.lower()

    async def test_gcp_returns_valid(self):
        from idun_agent_schema.engine.observability_v2 import GCPLoggingConfig

        config = ObservabilityConfig(
            provider=ObservabilityProvider.GCP_LOGGING,
            enabled=True,
            config=GCPLoggingConfig(project_id="my-project"),
        )
        result = await check_observability(config)
        assert result.success is True
        assert "not supported" in result.message.lower()

    async def test_response_has_duration(self):
        config = ObservabilityConfig(
            provider=ObservabilityProvider.LANGFUSE,
            enabled=True,
            config=LangfuseConfig(),
        )
        result = await check_observability(config)
        assert result.duration_ms >= 0


@pytest.mark.asyncio
class TestCheckMemory:
    async def test_postgres_success(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = (1,)
        mock_conn.execute.return_value = mock_cursor
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)

        with patch.dict("sys.modules", {"psycopg": (mock_psycopg := MagicMock())}):
            mock_psycopg.AsyncConnection.connect = AsyncMock(return_value=mock_conn)
            result = await check_memory({"type": "postgres", "db_url": "postgresql://localhost/test"})

        assert result.success is True
        assert result.provider == "postgres"

    async def test_database_type_routes_to_postgres(self):
        mock_conn = AsyncMock()
        mock_cursor = AsyncMock()
        mock_cursor.fetchone.return_value = (1,)
        mock_conn.execute.return_value = mock_cursor
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)

        with patch.dict("sys.modules", {"psycopg": (mock_psycopg := MagicMock())}):
            mock_psycopg.AsyncConnection.connect = AsyncMock(return_value=mock_conn)
            result = await check_memory({"type": "database", "db_url": "postgresql://localhost/test"})

        assert result.success is True
        assert result.provider == "database"

    async def test_postgres_missing_url(self):
        result = await check_memory({"type": "postgres", "db_url": ""})
        assert result.success is False

    async def test_sqlite_success(self):
        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch.dict("sys.modules", {"aiosqlite": (mock_aiosqlite := MagicMock())}):
            mock_aiosqlite.connect.return_value = mock_db
            result = await check_memory({"type": "sqlite", "db_url": "sqlite:///test.db"})

        assert result.success is True
        assert result.provider == "sqlite"

    async def test_in_memory_always_succeeds(self):
        result = await check_memory({"type": "in_memory"})
        assert result.success is True

    async def test_memory_type_always_succeeds(self):
        result = await check_memory({"type": "memory"})
        assert result.success is True

    async def test_unsupported_type(self):
        result = await check_memory({"type": "redis"})
        assert result.success is False
        assert "unsupported" in result.message.lower()

    async def test_postgres_connection_error(self):
        with patch.dict("sys.modules", {"psycopg": (mock_psycopg := MagicMock())}):
            mock_psycopg.AsyncConnection.connect = AsyncMock(
                side_effect=Exception("Connection refused")
            )
            result = await check_memory({"type": "postgres", "db_url": "postgresql://bad/db"})

        assert result.success is False
        assert "Connection refused" in result.message
