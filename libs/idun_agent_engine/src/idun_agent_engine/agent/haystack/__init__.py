"""LangGraph agent package."""

from .haystack import HaystackAgent
from .haystack_model import HaystackAgentConfig

__all__ = [
    "HaystackAgent",
    "HaystackAgentConfig",
]
