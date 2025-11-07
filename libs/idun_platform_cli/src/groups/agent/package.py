import click


@click.command("package")
@click.argument("path")
def package_command(path: str):
    print(f"Path: {path}")
    pass
