from typing import Any, Dict, Optional, AsyncGenerator
import sqlite3
import importlib.util
import asyncio
import aiosqlite
import uuid
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import StateGraph
from ag_ui.core.events import (
    RunStartedEvent, RunFinishedEvent, TextMessageStartEvent,
    TextMessageContentEvent, TextMessageEndEvent, EventType,
    ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent, ThinkingStartEvent, ThinkingEndEvent,
    StepStartedEvent, StepFinishedEvent
)
from ag_ui.core.types import UserMessage
import json
from src.agent_frameworks.base_agent import BaseAgent
from src.agent_frameworks.langgraph_agent_config import LangGraphAgentConfig, SqliteCheckpointConfig

class LanggraphAgent(BaseAgent):
    """Placeholder implementation for a LangGraph agent.
    This class will wrap a LangGraph agent/graph and adapt it to the IAgent interface.
    """

    def __init__(self):
        self._id = str(uuid.uuid4())
        self._agent_type = "LangGraph"
        self._input_schema: Any = None 
        self._output_schema: Any = None
        self._agent_instance: Any = None
        self._checkpointer: Any = None
        self._store: Any = None
        self._connection: Any = None
        self._configuration: Optional[LangGraphAgentConfig] = None
        self._name: str = "Unnamed LangGraph Agent"
        self._infos: Dict[str, Any] = {"status": "Uninitialized", "name": self._name, "id": self._id}

    @property
    def id(self) -> str:
        return self._id

    @property
    def agent_type(self) -> str:
        return self._agent_type

    @property
    def name(self) -> str:
        return self._name

    @property
    def input_schema(self) -> Any:
        return self._input_schema

    @property
    def output_schema(self) -> Any:
        return self._output_schema

    @property
    def agent_instance(self) -> Any:
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() first.")
        return self._agent_instance

    @property
    def configuration(self) -> LangGraphAgentConfig:
        if not self._configuration:
            raise RuntimeError("Agent not configured. Call initialize() first.")
        return self._configuration

    @property
    def infos(self) -> Dict[str, Any]:
        self._infos["underlying_agent_type"] = str(type(self._agent_instance)) if self._agent_instance else "N/A"
        return self._infos

    async def initialize(self, config: LangGraphAgentConfig) -> None:
        """Initializes the LangGraph agent asynchronously."""
        self._configuration = LangGraphAgentConfig.model_validate(config)
        
        self._name = self._configuration.name or "Unnamed LangGraph Agent"
        self._infos["name"] = self._name

        await self._setup_persistence()

        graph_builder = self._load_graph_builder(self._configuration.graph_definition)
        self._infos["graph_definition"] = self._configuration.graph_definition

        self._agent_instance = graph_builder.compile(
            checkpointer=self._checkpointer, store=self._store
        )

        if self._agent_instance:
            self._input_schema = self._agent_instance.input_schema
            self._output_schema = self._agent_instance.output_schema
            self._infos["input_schema"] = str(self._input_schema)
            self._infos["output_schema"] = str(self._output_schema)
        else:
            self._input_schema = self._configuration.input_schema_definition
            self._output_schema = self._configuration.output_schema_definition

        self._infos["status"] = "Initialized"
        self._infos["config_used"] = self._configuration.model_dump()

    async def close(self):
        """Closes any open resources, like database connections."""
        if self._connection:
            await self._connection.close()
            self._connection = None
            print("Database connection closed.")

    async def _setup_persistence(self) -> None:
        """Configures the agent's persistence (checkpoint and store) asynchronously."""
        if not self._configuration:
            return

        if self._configuration.checkpointer:
            if isinstance(self._configuration.checkpointer, SqliteCheckpointConfig):
                self._connection = await aiosqlite.connect(self._configuration.checkpointer.db_path)
                self._checkpointer = AsyncSqliteSaver(conn=self._connection)
                self._infos["checkpointer"] = self._configuration.checkpointer.model_dump()
            else:
                raise NotImplementedError("Only SQLite checkpointer is supported.")

        if self._configuration.store:
            raise NotImplementedError("Store functionality is not yet implemented.")

    def _load_graph_builder(self, graph_definition: str) -> StateGraph:
        """Loads a StateGraph instance from a specified path."""
        try:
            module_path, graph_variable_name = graph_definition.rsplit(":", 1)
        except ValueError:
            raise ValueError(
                "graph_definition must be in the format 'path/to/file.py:variable_name'"
            )

        try:
            spec = importlib.util.spec_from_file_location(
                graph_variable_name, module_path
            )
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load spec for module at {module_path}")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            graph_builder = getattr(module, graph_variable_name)
        except (FileNotFoundError, ImportError, AttributeError) as e:
            raise ValueError(f"Failed to load agent from {graph_definition}: {e}")

        if not isinstance(graph_builder, StateGraph):
            raise TypeError(
                f"The variable '{graph_variable_name}' from {module_path} is not a StateGraph instance."
            )

        return graph_builder
        
    async def invoke(self, message: Any) -> Any:
        """
        Processes a single input message to chat with the agent.
        The message should be a dictionary containing 'query' and 'session_id'.
        """
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() before processing messages.")

        if not isinstance(message, dict) or "query" not in message or "session_id" not in message:
            raise ValueError("Message must be a dictionary with 'query' and 'session_id' keys.")

        graph_input = {"messages": [("user", message["query"])]}
        config = {"configurable": {"thread_id": message["session_id"]}}

        output = await self._agent_instance.ainvoke(graph_input, config)

        if output and "messages" in output and output["messages"]:
            response_message = output["messages"][-1]
            if hasattr(response_message, 'content'):
                return response_message.content
            elif isinstance(response_message, dict) and 'content' in response_message:
                return response_message['content']
            elif isinstance(response_message, tuple):
                return response_message[1] 
            else:
                response_message

        return output

    async def stream(self, message: Any) -> AsyncGenerator[Any, None]:
        """Processes a single input message and returns a stream of ag-ui events."""
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() before processing messages.")

        if isinstance(message, dict) and "query" in message and "session_id" in message:
            run_id = f"run_{uuid.uuid4()}"
            thread_id = message["session_id"]
            user_message = UserMessage(id=f"msg_{uuid.uuid4()}", role="user", content=message["query"])
            graph_input = {"messages": [user_message.model_dump(by_alias=True, exclude_none=True)]}
        else:
            raise ValueError("Unsupported message format for process_message_stream. Expects {'query': str, 'session_id': str}")

        config = {"configurable": {"thread_id": thread_id}}

        current_message_id = None
        current_tool_call_id = None
        tool_call_name = None
        current_step_name = None

        async for event in self._agent_instance.astream_events(graph_input, config=config, version="v2"):
            kind = event["event"]
            name = event["name"]
            
            if kind == "on_chain_start":
                current_step_name = name
                if current_step_name.lower() == "langgraph":
                     yield RunStartedEvent(type=EventType.RUN_STARTED, run_id=run_id, thread_id=thread_id)
                else:
                    yield StepStartedEvent(type=EventType.STEP_STARTED, step_name=name)
            
            elif kind == "on_chain_end":
                if current_step_name:
                    yield StepFinishedEvent(type=EventType.STEP_FINISHED, step_name=name)
                    current_step_name = None

            elif kind == "on_llm_start":
                yield ThinkingStartEvent(type=EventType.THINKING_START, title=f"Thinking with {name}...")

            elif kind == "on_llm_end":
                yield ThinkingEndEvent(type=EventType.THINKING_END)

            elif kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if not current_message_id and (chunk.content or chunk.tool_calls):
                    current_message_id = f"msg_{uuid.uuid4()}"
                    yield TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=current_message_id, role="assistant")

                if chunk.content:
                    yield TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, message_id=current_message_id, delta=chunk.content)

                if chunk.tool_calls:
                    for tc in chunk.tool_calls:
                        if 'id' in tc and tc['id'] != current_tool_call_id:
                            if current_tool_call_id: # End previous tool call if a new one starts
                                yield ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=current_tool_call_id)
                            
                            current_tool_call_id = tc['id']
                            tool_call_name = tc['function']['name']
                            yield ToolCallStartEvent(type=EventType.TOOL_CALL_START, tool_call_id=current_tool_call_id, tool_call_name=tool_call_name, parent_message_id=current_message_id)

                        if 'function' in tc and 'arguments' in tc['function'] and tc['function']['arguments']:
                            yield ToolCallArgsEvent(type=EventType.TOOL_CALL_ARGS, tool_call_id=current_tool_call_id, delta=tc['function']['arguments'])

            elif kind == "on_tool_start":
                yield StepStartedEvent(type=EventType.STEP_STARTED, step_name=name)

            elif kind == "on_tool_end":
                # Tool end event from langgraph has the tool output, but ag-ui model doesn't have a place for it in ToolCallEndEvent
                if current_tool_call_id:
                    yield ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=current_tool_call_id)
                    current_tool_call_id = None
                
                yield StepFinishedEvent(type=EventType.STEP_FINISHED, step_name=name)
                tool_call_name = None

        if current_tool_call_id:
             yield ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=current_tool_call_id)

        if current_message_id:
            yield TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=current_message_id)

        yield RunFinishedEvent(type=EventType.RUN_FINISHED, run_id=run_id, thread_id=thread_id)
