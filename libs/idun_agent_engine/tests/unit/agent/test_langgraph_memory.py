import sqlite3
import tempfile
from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_langgraph_agent_with_sqlite_memory():
    from idun_agent_engine.core.config_builder import ConfigBuilder

    mock_graph_path = (
        Path(__file__).parent.parent.parent / "fixtures" / "agents" / "mock_graph.py"
    )

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_db:
        db_path = tmp_db.name

    db_url = f"sqlite:///{db_path}"

    config = {
        "agent": {
            "type": "LANGGRAPH",
            "config": {
                "name": "test_langgraph_memory",
                "graph_definition": f"{mock_graph_path}:graph",
                "checkpointer": {
                    "type": "sqlite",
                    "db_url": db_url,
                },
            },
        },
    }

    engine_config = ConfigBuilder.from_dict(config).build()
    agent = await ConfigBuilder.initialize_agent_from_config(engine_config)

    test_message_1 = "first message"
    test_message_2 = "second message"
    session_id = "test_session_123"

    try:
        await agent.invoke({"query": test_message_1, "session_id": session_id})
        await agent.invoke({"query": test_message_2, "session_id": session_id})

        if hasattr(agent, "graph") and hasattr(agent.graph, "checkpointer"):
            checkpointer = agent.graph.checkpointer
            if hasattr(checkpointer, "__aexit__"):
                await checkpointer.__aexit__(None, None, None)

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()

        assert len(tables) > 0

        cursor.execute("SELECT * FROM checkpoints WHERE thread_id = ?", (session_id,))
        checkpoints = cursor.fetchall()

        assert len(checkpoints) > 0

        all_data = str(checkpoints)
        assert test_message_1 in all_data or test_message_2 in all_data

        conn.close()
    finally:
        if hasattr(agent, "_connection") and agent._connection:
            await agent._connection.close()

        import os

        if os.path.exists(db_path):
            os.unlink(db_path)
