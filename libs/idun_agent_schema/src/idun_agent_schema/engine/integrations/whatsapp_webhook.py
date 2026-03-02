"""Pydantic models for WhatsApp Cloud API webhook payloads."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WhatsAppTextBody(BaseModel):
    body: str


class WhatsAppMessage(BaseModel):
    sender: str = Field(alias="from")
    id: str
    timestamp: str
    type: str
    text: WhatsAppTextBody | None = None


class WhatsAppValue(BaseModel):
    messaging_product: str = "whatsapp"
    messages: list[WhatsAppMessage] | None = None


class WhatsAppChange(BaseModel):
    value: WhatsAppValue
    field: str


class WhatsAppEntry(BaseModel):
    id: str
    changes: list[WhatsAppChange]


class WhatsAppWebhookPayload(BaseModel):
    object: str
    entry: list[WhatsAppEntry]
