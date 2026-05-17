"""SQLAlchemy ORM for the standalone_trace table.

Postgres uses a partitioned-by-month layout; the ORM still maps to a
single logical table -- partitioning is transparent at the SQLAlchemy
layer. SQLite uses the same logical schema with type adaptations
performed at the migration level.

Schema source: tasks/trace-feature-08-05-2026/09-postgres-schema.md.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    LargeBinary,
    Numeric,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneTraceRow(Base):
    """Top-level execution row.

    PK ``(started_at, otel_trace_id)`` -- natural-key from W3C trace_id.
    The partition key (``started_at``) is required to come first in the
    PK so PG declarative range partitioning can be applied at the
    migration level.
    """

    __tablename__ = "standalone_trace"

    # Composite PK -- partition key first for PG declarative partitioning.
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, primary_key=True
    )
    otel_trace_id: Mapped[bytes] = mapped_column(
        LargeBinary(16), nullable=False, primary_key=True
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[str | None] = mapped_column(Text)
    session_id: Mapped[str | None] = mapped_column(Text)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[float | None] = mapped_column(Numeric)
    total_tokens: Mapped[int | None] = mapped_column(BigInteger)
    total_cost_usd: Mapped[float | None] = mapped_column(Numeric(20, 10))

    # PG: ``text[]`` / SQLite: JSON list. The migration writes the
    # dialect-specific column type; the ORM declares the PG-native
    # ``ARRAY(Text)`` with a SQLite ``JSON`` variant so query-time access
    # works on both backends.
    models: Mapped[list[str] | None] = mapped_column(
        ARRAY(Text).with_variant(JSON, "sqlite")
    )
    tags: Mapped[list[str] | None] = mapped_column(
        ARRAY(Text).with_variant(JSON, "sqlite")
    )
    # SQLAlchemy reserves ``metadata`` on declarative classes; map the
    # column to the attribute ``metadata_`` instead. Keeps the wire-level
    # column name aligned with the locked schema.
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata",
        JSONB().with_variant(JSON, "sqlite"),
    )
