import os
from typing import Any


def _resolve_env(value: Any) -> Any:
    if isinstance(value, str):
        if value.startswith("${") and value.endswith("}"):
            return os.getenv(value[2:-1])
        if value.startswith("$"):
            return os.getenv(value[1:])
    return value
