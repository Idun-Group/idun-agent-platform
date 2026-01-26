"""Export the Agent Manager OpenAPI schema for frontend type generation."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]

    schema_src = repo_root / "libs" / "idun_agent_schema" / "src"
    engine_src = repo_root / "libs" / "idun_agent_engine" / "src"
    manager_src = repo_root / "services" / "idun_agent_manager" / "src"

    for candidate in (schema_src, engine_src, manager_src):
        sys.path.insert(0, str(candidate))

    os.environ.setdefault("DATABASE__URL", "sqlite+aiosqlite:///tmp/idun-schemas.db")
    os.environ.setdefault(
        "AUTH__SECRET_KEY", "development-secret-key-for-schema-export"
    )
    os.environ.setdefault("ENVIRONMENT", "development")

    from app.main import app  # type: ignore

    openapi = app.openapi()

    output_path = (
        repo_root
        / "services"
        / "idun_agent_web"
        / "schema"
        / "manager-openapi.json"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(openapi, indent=2))

    print(f"OpenAPI schema written to {output_path.relative_to(repo_root)}")


if __name__ == "__main__":
    main()
