def test_import_package() -> None:
    import importlib

    pkg = importlib.import_module("idun_agent_engine")
    assert hasattr(pkg, "create_app")
