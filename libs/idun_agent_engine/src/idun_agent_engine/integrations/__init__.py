"""Integration package for external messaging providers."""

from .base import BaseIntegration, setup_integrations

__all__ = [
    "BaseIntegration",
    "setup_integrations",
]
