"""Integration tests for containerized environment."""

import httpx
import pytest
from sqlalchemy import text

from app.infrastructure.db.session import get_async_session


class TestContainerizedEnvironment:
    """Test that the containerized environment is working correctly."""

    @pytest.mark.asyncio
    async def test_database_connection(self):
        """Test that we can connect to the database."""
        async for session in get_async_session():
            result = await session.execute(text("SELECT 1 as test"))
            assert result.scalar() == 1
            break

    @pytest.mark.asyncio
    async def test_health_endpoint(self):
        """Test that the health endpoint is accessible."""
        async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
            response = await client.get("/healthz")
            assert response.status_code == 200
            assert response.json() == {"status": "healthy"}

    @pytest.mark.asyncio
    async def test_redis_connection(self):
        """Test that Redis is accessible (if using redis for tests)."""
        try:
            import redis.asyncio as redis

            client = redis.Redis.from_url("redis://redis:6379/0")
            await client.ping()
            await client.close()
        except ImportError:
            pytest.skip("Redis not available for testing")

    @pytest.mark.asyncio
    async def test_api_docs_accessible(self):
        """Test that API documentation is accessible."""
        async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
            response = await client.get("/docs")
            assert response.status_code == 200
            assert "text/html" in response.headers["content-type"]
