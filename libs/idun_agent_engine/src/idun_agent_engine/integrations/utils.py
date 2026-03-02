"""Shared utilities for messaging integrations."""

from __future__ import annotations

from typing import Any


def extract_text_content(content: Any) -> str:
    """Normalise LLM message content to a plain-text string."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content)
    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif (
            isinstance(block, dict)
            and block.get("type") == "text"
            and isinstance(block.get("text"), str)
        ):
            parts.append(block["text"])
    return "".join(parts) if parts else str(content)
