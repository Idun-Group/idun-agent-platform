"""Generate TypeScript typings for Agent Manager API from OpenAPI schema."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    openapi_path = (
        repo_root / "services" / "idun_agent_web" / "schema" / "manager-openapi.json"
    )

    if not openapi_path.exists():
        print(
            "OpenAPI schema not found. Run scripts/export_manager_openapi.py first.",
            file=sys.stderr,
        )
        sys.exit(1)

    web_root = repo_root / "services" / "idun_agent_web"
    generated_dir = web_root / "src" / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)

    args = [
        "npm",
        "--prefix",
        str(web_root),
        "run",
        "generate:manager-types",
    ]

    subprocess.run(args, check=True)

    output_path = generated_dir / "agent-manager.ts"
    print(f"TypeScript types written to {output_path.relative_to(repo_root)}")


if __name__ == "__main__":
    main()

