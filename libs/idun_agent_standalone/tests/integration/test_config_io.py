"""End-to-end YAML <-> DB roundtrip via the runtime helpers."""

from __future__ import annotations

import yaml
from click.testing import CliRunner
from idun_agent_standalone.cli import main
from idun_agent_standalone.db.migrate import upgrade_head


def test_cli_import_then_export_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'r.db'}"
    )
    upgrade_head()

    yaml_in = tmp_path / "in.yaml"
    yaml_in.write_text(
        yaml.safe_dump(
            {
                "agent": {
                    "type": "LANGGRAPH",
                    "config": {
                        "name": "hello",
                        "graph_definition": (
                            "idun_agent_standalone.testing:echo_graph"
                        ),
                        "checkpointer": {"type": "memory"},
                    },
                },
                "theme": {"appName": "Hello", "layout": "branded"},
            }
        )
    )

    r = CliRunner().invoke(main, ["import", str(yaml_in)])
    assert r.exit_code == 0, r.output

    r2 = CliRunner().invoke(main, ["export"])
    assert r2.exit_code == 0
    dumped = yaml.safe_load(r2.output)
    assert dumped["agent"]["config"]["name"] == "hello"
    assert dumped["theme"]["appName"] == "Hello"
