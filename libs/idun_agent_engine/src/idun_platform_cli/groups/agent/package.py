import sys
from enum import StrEnum
from pathlib import Path

import click


class Dependency(StrEnum):
    """Dependency Enum."""

    REQUIREMENT = "requirements.txt"
    PYPROJECT = "pyproject.toml"
    NONE = "none"


def get_dependencies(path: str) -> Dependency:
    """Verifies if the path folder contains a `requirements.txt` or `pyproject.toml`, and returns which."""
    """:param path: Path pointing to the agent's folder."""
    agent_path = Path(path).resolve()
    if (agent_path / "requirements.txt").exists():
        return Dependency.REQUIREMENT
    elif (agent_path / "pyproject.toml").exists():
        return Dependency.PYPROJECT
    else:
        return Dependency.NONE


def generate_dockerfile(dependency: Dependency) -> str:
    # TODO: add envs vars based on source
    """Generates Dockerfile based on given params."""
    if dependency == Dependency.NONE:
        print(
            "[ERROR]: No pyproject.toml or requirements.txt found. Please make sure to include them."
        )
        sys.exit(1)
    if dependency == Dependency.REQUIREMENT:
        requirements_dockerfile = f"""FROM python:3.13-slim
RUN apt-get update && pip install uv
WORKDIR /app

RUN uv pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \\
    --extra-index-url https://pypi.org/simple idun-agent-schema==0.2.1.dev20251117151420 \\
    --index-strategy unsafe-best-match --prerelease=allow

RUN uv pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \\
    --extra-index-url https://pypi.org/simple idun-agent-engine==0.2.1.dev20251117151427 \\
    --index-strategy unsafe-best-match --prerelease=allow

COPY {dependency} ./
COPY config.yaml ./
RUN uv pip install -r {dependency} --system

CMD ["idun", "agent", "serve", "--source=file", "--path", "config.yaml"]
"""
        return requirements_dockerfile


@click.command("package")
@click.argument("path", default=".")
@click.option("--target", required=False, default=".")
def package_command(path: str, target: str):
    """Packages the agent and it's dependencies into a Dockerfile. You can specifiy the input path and the destination. Defaults to current directory."""
    dependency = get_dependencies(path)
    dockerfile = generate_dockerfile(dependency)
    target_path = Path(target)
    dockerfile_path = target_path / "Dockerfile"
    try:
        dockerfile_path.write_text(dockerfile)
        print(f"Dockerfile generated in {target}")
    except OSError as e:
        print(f"[ERROR]: Cannot write dockerfile to path {target}: {e}")
