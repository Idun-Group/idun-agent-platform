"""Compatibility shim: re-export DeploymentMode from schema library."""

from idun_agent_schema.manager.deployments import DeploymentMode  # noqa: F401

__all__ = ["DeploymentMode"]
