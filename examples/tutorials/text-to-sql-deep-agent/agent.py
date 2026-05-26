import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langgraph.graph.state import CompiledStateGraph

from idun_agent_engine import get_prompt


load_dotenv()


def create_sql_deep_agent() -> CompiledStateGraph:
    """Create and return a text-to-SQL Deep Agent"""

    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, "chinook.db")
    db = SQLDatabase.from_uri(f"sqlite:///{db_path}", sample_rows_in_table_info=3)

    from langchain_google_genai import ChatGoogleGenerativeAI

    model = ChatGoogleGenerativeAI(
        model="gemini-3.1-pro-preview",
        google_api_key=os.getenv("GEMINI_API_KEY"),
    )
    toolkit = SQLDatabaseToolkit(db=db, llm=model)
    sql_tools = toolkit.get_tools()

    agents_md = get_prompt("agents-md")
    if agents_md is None:
        raise RuntimeError("Prompt 'agents-md' not found in engine config")

    return create_deep_agent(
        model=model,
        system_prompt=agents_md.content,
        skills=["./skills/"],
        tools=sql_tools,
        subagents=[],
        backend=FilesystemBackend(root_dir=base_dir),
    )


agent = create_sql_deep_agent()
