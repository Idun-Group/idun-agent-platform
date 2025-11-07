"""Manage, Deploy and package agents."""

import click

from .serve import serve_command
from .package import package_command


@click.group()
def agent():
    """Agent command entrypoint."""
    print("Called from agent")


agent.add_command(serve_command, name="serve")
agent.add_command(package_command, name="package")
