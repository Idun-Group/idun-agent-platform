"""Sanity tests to ensure package imports."""


def test_import_package() -> None:
    """Package exposes main entrypoints."""
    import importlib

    pkg = importlib.import_module("idun_agent_engine")
    assert hasattr(pkg, "create_app")
