"""SQLAlchemy ORM for the standalone_span table.

Schema source: tasks/trace-feature-08-05-2026/09-postgres-schema.md.

``total_tokens`` is computed at the storage level via PG
``GENERATED ALWAYS AS ... STORED``; the ORM exposes it as a regular
read-only ``Mapped[int | None]``. SQLite has no generated-column
analogue -- the writer is responsible for stamping the sum on insert.
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.infrastructure.db.session import Base


class StandaloneSpanRow(Base):
    """Per-span row -- one row per OpenInference span emitted by the engine."""

    __tablename__ = "standalone_span"

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, primary_key=True
    )
    otel_span_id: Mapped[bytes] = mapped_column(
        LargeBinary(8), nullable=False, primary_key=True
    )
    otel_trace_id: Mapped[bytes] = mapped_column(LargeBinary(8), nullable=False)
    parent_span_id: Mapped[bytes | None] = mapped_column(LargeBinary(8))

    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    latency_ms: Mapped[float | None] = mapped_column(Numeric)

    model: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(Text)
    prompt_tokens: Mapped[int | None] = mapped_column(BigInteger)
    completion_tokens: Mapped[int | None] = mapped_column(BigInteger)
    cache_read_tokens: Mapped[int | None] = mapped_column(BigInteger)
    cache_write_tokens: Mapped[int | None] = mapped_column(BigInteger)
    # ``total_tokens`` is GENERATED ALWAYS AS at the migration level on PG;
    # SQLite stamps it explicitly at write time.
    total_tokens: Mapped[int | None] = mapped_column(BigInteger)
    cost_usd: Mapped[float | None] = mapped_column(Numeric(20, 10))
    cost_breakdown: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(JSON, "sqlite")
    )
    cost_source: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(Text)
    attributes: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(JSON, "sqlite")
    )
    events: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(JSON, "sqlite")
    )
