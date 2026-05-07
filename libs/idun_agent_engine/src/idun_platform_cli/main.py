import click

from idun_platform_cli.groups.agent.main import agent


@click.group()
def cli():
    """Entrypoint of the CLI."""
    pass


cli.add_command(agent)

if __name__ == "__main__":
    cli()
