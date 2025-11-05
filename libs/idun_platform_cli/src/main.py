import click
from serve import serve


@click.group()
def cli():
    """Entrypoint of the CLI."""
    pass


cli.add_command(serve)

if __name__ == "__main__":
    cli()
