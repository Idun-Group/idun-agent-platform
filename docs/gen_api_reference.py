"""Generate API reference pages for mkdocstrings by creating a stub md file per module.

This script is executed by the mkdocs-gen-files plugin during the build.
"""

from __future__ import annotations

from pathlib import Path

import mkdocs_gen_files  # type: ignore[reportMissingImports]


def iter_python_modules(package_root: Path) -> list[tuple[str, bool]]:
    """Enumerate Python modules under a package root.

    Returns a list of tuples ``(module_dotted_path, is_package)`` where:
    - ``is_package`` is True for directories containing ``__init__.py``
    - regular ``.py`` files (excluding ``__init__.py``) are marked as modules
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
    """Convert a package directory path to dotted import path relative to root."""
    rel = package_path.relative_to(root)
    return ".".join(rel.parts)


def file_path_to_dotted(root: Path, file_path: Path) -> str:
    """Convert a file path to dotted import path (without suffix) relative to root."""
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
