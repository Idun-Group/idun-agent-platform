"""Agent package exposing common base types.

Re-exports:
    - BaseAgent: abstract base for all agents
    - BaseAgentConfig: base model for agent configuration
"""

from .base import BaseAgent
from .model import BaseAgentConfig

__all__ = ["BaseAgent", "BaseAgentConfig"]
