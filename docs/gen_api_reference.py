"""
Generate API reference pages for mkdocstrings by creating a stub md file per module.

This script is executed by the mkdocs-gen-files plugin during the build.
"""

from __future__ import annotations

import os
from pathlib import Path

import mkdocs_gen_files  # type: ignore[reportMissingImports]


def iter_python_modules(package_root: Path) -> list[tuple[str, bool]]:
    """Return list of (module_dotted_path, is_package).

    - Packages are directories containing __init__.py
    - Modules are .py files (excluding __init__.py)
    """
    modules: list[tuple[str, bool]] = []
    for file_path in package_root.rglob("*.py"):
        if file_path.name == "__init__.py":
            dotted = module_path_to_dotted(engine_src, file_path.parent)
            modules.append((dotted, True))
        else:
            dotted = file_path_to_dotted(engine_src, file_path)
            modules.append((dotted, False))
    return modules


def module_path_to_dotted(root: Path, package_path: Path) -> str:
    rel = package_path.relative_to(root)
    return ".".join(rel.parts)


def file_path_to_dotted(root: Path, file_path: Path) -> str:
    rel = file_path.relative_to(root)
    return ".".join(rel.with_suffix("").parts)


engine_src = Path("libs/idun_agent_engine/src")
root_package = engine_src / "idun_agent_engine"

if not root_package.exists():
    raise SystemExit(
        "Engine package not found at libs/idun_agent_engine/src/idun_agent_engine"
    )

nav = mkdocs_gen_files.Nav()  # type: ignore[attr-defined]

for module, is_package in iter_python_modules(root_package):
    if is_package:
        doc_file = Path("reference", *module.split("."), "index.md")
    else:
        doc_file = Path("reference", *module.split(".")).with_suffix(".md")

    nav[module] = doc_file.as_posix()  # type: ignore[index]

    with mkdocs_gen_files.open(doc_file, "w") as fd:
        print(f"# {module}", file=fd)
        print("", file=fd)
        print(f"::: {module}", file=fd)

with mkdocs_gen_files.open("reference/SUMMARY.md", "w") as nav_file:
    nav_file.writelines(nav.build_literate_nav())  # type: ignore[attr-defined]
