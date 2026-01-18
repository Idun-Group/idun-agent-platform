import click

from idun_platform_cli.groups.agent.main import agent
from idun_platform_cli.groups.init import init_command


@click.group()
def cli():
    """Entrypoint of the CLI."""
    pass


cli.add_command(agent)
cli.add_command(init_command, name="init")

if __name__ == "__main__":
    cli()
