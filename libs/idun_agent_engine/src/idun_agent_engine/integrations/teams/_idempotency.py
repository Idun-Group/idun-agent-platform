"""In-process activity dedup using cachetools TTLCache."""

from __future__ import annotations

from cachetools import TTLCache


class SeenActivities:
    def __init__(self, maxsize: int = 1024, ttl_seconds: float = 60.0) -> None:
        self._cache: TTLCache[str, bool] = TTLCache(maxsize=maxsize, ttl=ttl_seconds)

    def seen(self, key: str) -> bool:
        if key in self._cache:
            return True
        self._cache[key] = True
        return False
