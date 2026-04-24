"""ORM models for the standalone DB.

The schema is single-tenant. Singleton resources (agent, guardrail, memory,
observability, theme, admin user) use a fixed primary key (``"singleton"`` or
``"admin"``); collection resources (mcp_server, prompt, integration) use
UUID strings. Trace events live in ``trace_event`` keyed by AG-UI thread id
and run id, with a per-run sequence number.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from idun_agent_standalone.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AgentRow(Base):
    __tablename__ = "agent"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    framework: Mapped[str] = mapped_column(String(64))
    graph_definition: Mapped[str] = mapped_column(Text)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class GuardrailRow(Base):
    __tablename__ = "guardrail"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class MemoryRow(Base):
    __tablename__ = "memory"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ObservabilityRow(Base):
    __tablename__ = "observability"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ThemeRow(Base):
    __tablename__ = "theme"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class McpServerRow(Base):
    __tablename__ = "mcp_server"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class PromptRow(Base):
    __tablename__ = "prompt"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    prompt_key: Mapped[str] = mapped_column(String(255), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    __table_args__ = (
        UniqueConstraint("prompt_key", "version", name="uq_prompt_key_version"),
    )


class IntegrationRow(Base):
    __tablename__ = "integration"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class SessionRow(Base):
    __tablename__ = "session"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    last_event_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, index=True
    )
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)


class TraceEventRow(Base):
    __tablename__ = "trace_event"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("session.id", ondelete="CASCADE"), index=True
    )
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )


class AdminUserRow(Base):
    __tablename__ = "admin_user"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    password_rotated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
