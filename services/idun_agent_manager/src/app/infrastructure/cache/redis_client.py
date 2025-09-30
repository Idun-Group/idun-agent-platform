"""Redis caching client for the application."""

import redis.asyncio as redis

from app.core.logging import get_logger
from app.core.settings import get_settings

logger = get_logger(__name__)


class RedisClient:
    """Redis client for caching operations."""

    def __init__(self) -> None:
        """Initialize Redis client."""
        self.settings = get_settings()
        self._client: redis.Redis | None = None

    async def get_client(self) -> redis.Redis:
        """Get or create Redis client instance."""
        if self._client is None:
            self._client = redis.from_url(
                self.settings.redis.url,
                max_connections=self.settings.redis.max_connections,
                decode_responses=True,
            )
        return self._client

    async def get(self, key: str) -> str | None:
        """Get value from Redis."""
        try:
            client = await self.get_client()
            return await client.get(key)
        except Exception as e:
            logger.error("Failed to get from Redis", key=key, error=str(e))
            return None

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        """Set value in Redis with optional expiration."""
        try:
            client = await self.get_client()
            return await client.set(key, value, ex=ex)
        except Exception as e:
            logger.error("Failed to set in Redis", key=key, error=str(e))
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from Redis."""
        try:
            client = await self.get_client()
            return bool(await client.delete(key))
        except Exception as e:
            logger.error("Failed to delete from Redis", key=key, error=str(e))
            return False

    async def close(self) -> None:
        """Close Redis connection."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Global instance
_redis_client: RedisClient | None = None


def get_redis_client() -> RedisClient:
    """Get Redis client instance."""
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisClient()
    return _redis_client
