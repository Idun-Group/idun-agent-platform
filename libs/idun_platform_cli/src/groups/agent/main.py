"""Manage, Deploy and package agents."""

import click

from .package import package_command
from .serve import serve_command


@click.group()
def agent():
    """Agent command entrypoint."""
    pass


agent.add_command(serve_command, name="serve")
agent.add_command(package_command, name="package")
