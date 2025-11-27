from functools import lru_cache

from app.infrastructure.cache.postgres_session_storage import PostgresSessionStorage
from app.infrastructure.cache.session_storage import SessionStorage


@lru_cache
def get_session_storage() -> SessionStorage:
    return PostgresSessionStorage()