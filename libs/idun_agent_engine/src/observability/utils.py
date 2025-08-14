"""Utility helpers for observability configuration.

Functions here help resolve environment placeholders like ${VAR} or $VAR.
"""

import os
from typing import Any


def _resolve_env(value: Any) -> Any:
    """Resolve environment placeholders in strings.

    Supports patterns ${VAR} and $VAR. Non-strings are returned unchanged.
    """
    if isinstance(value, str):
        if value.startswith("${") and value.endswith("}"):
            return os.getenv(value[2:-1])
        if value.startswith("$"):
            return os.getenv(value[1:])
    return value
