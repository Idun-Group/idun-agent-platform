from idun_agent_schema import __version__ as schema_version


def test_schema_available():
    assert isinstance(schema_version, str) and len(schema_version) > 0
