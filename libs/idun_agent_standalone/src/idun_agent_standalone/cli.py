"""Command-line entry point for idun-agent-standalone.

Subcommands implemented in Phase 1: ``hash-password``. Other subcommands
(``serve``, ``export``, ``import``, ``db migrate``, ``init``) are wired here
but raise ``NotImplementedError`` until later phases provide their runtime
helpers. The CLI surface itself is stable from this point on.
"""

from __future__ import annotations

import bcrypt
import click


@click.group()
def main() -> None:
    """Idun Agent Standalone — self-sufficient single-agent deployment."""


@main.command("serve")
@click.option("--config", "config_path", type=click.Path(), default=None)
@click.option("--host", default=None)
@click.option("--port", default=None, type=int)
@click.option("--auth-mode", default=None, type=click.Choice(["none", "password", "oidc"]))
@click.option("--ui-dir", default=None, type=click.Path())
@click.option("--database-url", default=None)
def serve(
    config_path: str | None,
    host: str | None,
    port: int | None,
    auth_mode: str | None,
    ui_dir: str | None,
    database_url: str | None,
) -> None:
    """Run the standalone server."""
    from idun_agent_standalone.runtime import run_server

    run_server(
        config_path=config_path,
        host=host,
        port=port,
        auth_mode=auth_mode,
        ui_dir=ui_dir,
        database_url=database_url,
    )


@main.command("hash-password")
@click.option("--password", prompt=True, hide_input=True, confirmation_prompt=False)
def hash_password(password: str) -> None:
    """Print a bcrypt hash for IDUN_ADMIN_PASSWORD_HASH."""
    h = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    click.echo(h.decode("utf-8"))


@main.command("export")
def export_cmd() -> None:
    """Dump current DB state as YAML to stdout."""
    import sys

    from idun_agent_standalone.runtime import export_to_yaml_sync

    sys.stdout.write(export_to_yaml_sync())


@main.command("import")
@click.argument("file", type=click.Path(exists=True))
def import_cmd(file: str) -> None:
    """Load a YAML file into the DB (replaces current state)."""
    from idun_agent_standalone.runtime import import_from_yaml_sync

    import_from_yaml_sync(file)
    click.echo("Imported.")


@main.group("db")
def db_group() -> None:
    """Database administration."""


@db_group.command("migrate")
def db_migrate() -> None:
    """Run Alembic migrations to the latest head."""
    from idun_agent_standalone.db.migrate import upgrade_head

    upgrade_head()
    click.echo("DB migrated.")


@main.command("init")
@click.argument("name", required=False)
@click.option(
    "--target",
    "target",
    type=click.Path(),
    default=None,
    help="Directory to scaffold into (defaults to ./<name>).",
)
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="Overwrite an existing non-empty directory.",
)
def init_cmd(name: str | None, target: str | None, force: bool) -> None:
    """Scaffold a new agent project directory."""
    from pathlib import Path

    from idun_agent_standalone.scaffold import scaffold_project

    project_name = name or "my-agent"
    target_dir = Path(target) if target else None
    scaffolded = scaffold_project(project_name, target_dir, force=force)
    click.echo(
        f"Scaffolded {scaffolded}. Next: "
        f"cd {scaffolded.name} && cp .env.example .env && idun-standalone serve"
    )
