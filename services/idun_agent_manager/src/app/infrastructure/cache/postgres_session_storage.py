import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update

from app.infrastructure.cache.session_storage import SessionStorage
from app.infrastructure.db.models.session import SessionModel
from app.infrastructure.db.session import get_async_session_maker


class PostgresSessionStorage(SessionStorage):
    async def get(self, key: str) -> str | None:
        session_id = key.replace("sid:", "")
        session_maker = get_async_session_maker()

        async with session_maker() as session:
            stmt = select(SessionModel).where(
                SessionModel.id == session_id,
                SessionModel.expires_at > datetime.now(UTC),
            )
            result = await session.execute(stmt)
            session_obj = result.scalar_one_or_none()

            if session_obj:
                return json.dumps(session_obj.data)
            return None

    async def set(self, key: str, value: str, ttl: int = 3600) -> None:
        session_id = key.replace("sid:", "")
        data = json.loads(value)
        expires_at = datetime.now(UTC) + timedelta(seconds=ttl)
        session_maker = get_async_session_maker()

        async with session_maker() as session:
            stmt = select(SessionModel).where(SessionModel.id == session_id)
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                await session.execute(
                    update(SessionModel)
                    .where(SessionModel.id == session_id)
                    .values(
                        data=data, expires_at=expires_at, updated_at=datetime.now(UTC)
                    )
                )
            else:
                session_obj = SessionModel(
                    id=session_id, data=data, expires_at=expires_at
                )
                session.add(session_obj)

            await session.commit()

    async def delete(self, key: str) -> None:
        session_id = key.replace("sid:", "")
        session_maker = get_async_session_maker()

        async with session_maker() as session:
            await session.execute(
                delete(SessionModel).where(SessionModel.id == session_id)
            )
            await session.commit()

    async def exists(self, key: str) -> bool:
        session_id = key.replace("sid:", "")
        session_maker = get_async_session_maker()

        async with session_maker() as session:
            stmt = select(SessionModel).where(
                SessionModel.id == session_id,
                SessionModel.expires_at > datetime.now(UTC),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None
