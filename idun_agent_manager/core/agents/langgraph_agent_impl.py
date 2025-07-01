from typing import Any, Dict, Optional, AsyncGenerator
import sqlite3
import importlib.util
import asyncio
import aiosqlite
import uuid
from idun_agent_manager.core.iagent import IAgent
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import StateGraph
from idun_agent_manager.ag_ui.core.events import (
    RunStartedEvent, RunFinishedEvent, TextMessageStartEvent,
    TextMessageContentEvent, TextMessageEndEvent, EventType,
    ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent, ThinkingStartEvent, ThinkingEndEvent,
    StepStartedEvent, StepFinishedEvent
)
from idun_agent_manager.ag_ui.core.types import UserMessage
import json

class LanggraphAgent(IAgent):
    """Placeholder implementation for a LangGraph agent.
    This class will wrap a LangGraph agent/graph and adapt it to the IAgent interface.
    """

    def __init__(self, initial_config: Optional[Dict[str, Any]] = None):
        self._id = str(uuid.uuid4())
        self._agent_type = "LangGraph"
        self._input_schema: Any = None # Define based on expected LangGraph input
        self._output_schema: Any = None # Define based on expected LangGraph output
        self._agent_instance: Any = None # This will hold the LangGraph runnable
        self._checkpointer: Any = None
        self._store: Any = None
        self._connection: Any = None # To hold the async db connection
        self._configuration: Dict[str, Any] = initial_config or {}
        self._name: str = self._configuration.get("name", "Unnamed LangGraph Agent")
        self._infos: Dict[str, Any] = {"status": "Uninitialized", "name": self._name, "id": self._id}
        self._a2a_card: Optional[Dict[str, Any]] = None
        self._a2a_server_details: Optional[Dict[str, Any]] = None
        # Initialization is now an explicit async step to be called by the user.

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
    def configuration(self) -> Dict[str, Any]:
        return self._configuration

    @property
    def infos(self) -> Dict[str, Any]:
        # Potentially update infos dynamically based on agent state
        self._infos["underlying_agent_type"] = str(type(self._agent_instance)) if self._agent_instance else "N/A"
        return self._infos

    @property
    def a2a_card(self) -> Optional[Dict[str, Any]]:
        return self._a2a_card

    @property
    def a2a_server_details(self) -> Optional[Dict[str, Any]]:
        return self._a2a_server_details

    async def initialize(self, config: Dict[str, Any]) -> None:
        """Initializes the LangGraph agent asynchronously."""
        self._configuration = config
        self._name = config.get("name", "Unnamed LangGraph Agent")
        self._infos["name"] = self._name

        await self._setup_persistence(config)

        agent_path = config.get("agent_path")
        if not agent_path:
            raise ValueError("agent_path must be specified to load the LangGraph agent.")

        graph_builder = self._load_graph_builder(agent_path)
        self._infos["agent_path"] = agent_path

        # Compile the graph with the checkpointer and store
        self._agent_instance = graph_builder.compile(
            checkpointer=self._checkpointer, store=self._store
        )

        # The input/output schemas can be derived from the compiled graph
        if self._agent_instance:
            self._input_schema = self._agent_instance.input_schema
            self._output_schema = self._agent_instance.output_schema
            self._infos["input_schema"] = str(self._input_schema)
            self._infos["output_schema"] = str(self._output_schema)
        else:
            self._input_schema = config.get("input_schema_definition", Any)  # Fallback
            self._output_schema = config.get("output_schema_definition", Any)  # Fallback

        self._infos["status"] = "Initialized"
        self._infos["config_used"] = config

    async def close(self):
        """Closes any open resources, like database connections."""
        if self._connection:
            await self._connection.close()
            self._connection = None
            print("Database connection closed.")

    async def _setup_persistence(self, config: Dict[str, Any]) -> None:
        """Configures the agent's persistence (checkpoint and store) asynchronously."""
        # Checkpoint configuration
        checkpoint_config = config.get("checkpoint")
        if checkpoint_config:
            checkpoint_type = checkpoint_config.get("type")
            if checkpoint_type == "sqlite":
                db_path = checkpoint_config.get("db_path")
                if not db_path:
                    raise ValueError("db_path must be specified for sqlite checkpoint")
                # Manually create the connection and the saver
                self._connection = await aiosqlite.connect(db_path)
                self._checkpointer = AsyncSqliteSaver(conn=self._connection)
                self._infos["checkpoint"] = {"type": "sqlite_async", "db_path": db_path}
            elif checkpoint_type == "postgres":
                raise NotImplementedError("Postgres checkpoint not yet implemented.")
            else:
                raise ValueError(f"Unsupported checkpoint type: {checkpoint_type}")

        # Store configuration
        store_config = config.get("store")
        if store_config:
            store_type = store_config.get("type")
            if store_type == "sqlite":
                # The langgraph documentation does not clearly specify a SqliteStore.
                # It provides SqliteSaver for checkpoints. For stores, it gives examples
                # for InMemoryStore, PostgresStore, and RedisStore.
                # It's possible the checkpointer is intended to be used as the store for sqlite.
                # For now, we'll mark this as not implemented.
                raise NotImplementedError(
                    "Sqlite store not yet implemented. "
                    "LangGraph docs do not specify a separate SqliteStore."
                )
            elif store_type == "postgres":
                raise NotImplementedError("Postgres store not yet implemented.")
            else:
                raise ValueError(f"Unsupported store type: {store_type}")

    def _load_graph_builder(self, agent_path: str) -> StateGraph:
        """Loads a StateGraph instance from a specified path."""
        try:
            module_path, graph_variable_name = agent_path.rsplit(":", 1)
        except ValueError:
            raise ValueError(
                "agent_path must be in the format 'path/to/file.py:variable_name'"
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
            raise ValueError(f"Failed to load agent from {agent_path}: {e}")

        if not isinstance(graph_builder, StateGraph):
            raise TypeError(
                f"The variable '{graph_variable_name}' from {module_path} is not a StateGraph instance."
            )

        return graph_builder

    async def process_message(self, message: Any) -> Any:
        """
        Processes a single input message to chat with the agent.
        The message should be a dictionary containing 'query' and 'session_id'.
        """
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() before processing messages.")

        if not isinstance(message, dict) or "query" not in message or "session_id" not in message:
            raise ValueError("Message must be a dictionary with 'query' and 'session_id' keys.")

        # LangGraph expects a list of messages.
        # With checkpointing, the history is managed by the graph.
        # We just need to provide the new message.
        graph_input = {"messages": [("user", message["query"])]}
        config = {"configurable": {"thread_id": message["session_id"]}}

        # ainvoke the agent
        output = await self._agent_instance.ainvoke(graph_input, config)

        # The output of a graph with MessagesState contains the full message history.
        # The last message is the agent's response.
        if output and "messages" in output and output["messages"]:
            response_message = output["messages"][-1]
            if hasattr(response_message, 'content'):
                return response_message.content
            # Handle if it's a dict (less common for AIMessage but good to have)
            elif isinstance(response_message, dict) and 'content' in response_message:
                return response_message['content']
            return response_message

        return output

    async def process_message_stream(self, message: Any) -> AsyncGenerator[Any, None]:
        """Processes a single input message and returns a stream of ag-ui events."""
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() before processing messages.")

        if isinstance(message, dict) and "query" in message and "session_id" in message:
            run_id = f"run_{uuid.uuid4()}"
            thread_id = message["session_id"]
            # To alice with the ag-ui spec, we should use the UserMessage model
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

    def get_session(self, session_id: Optional[str] = None) -> Any:
        """Retrieves or establishes a session for the agent."""
        # TODO: Implement session management for LangGraph (e.g., using "thread_id" in config)
        print(f"LanggraphAgent: Getting session for ID: {session_id}")
        # This might just return a config dictionary for LangGraph's configurable fields.
        # return {"configurable": {"thread_id": session_id or str(uuid.uuid4())}}
        raise NotImplementedError("LanggraphAgent.get_session not implemented.")

    def get_memory(self, session_id: Optional[str] = None) -> Any:
        """Accesses the agent's memory, optionally for a specific session."""
        # TODO: Implement memory access, possibly via LangGraph checkpoints or custom memory setup.
        print(f"LanggraphAgent: Getting memory for session ID: {session_id}")
        raise NotImplementedError("LanggraphAgent.get_memory not implemented.")

    def set_observability(self, observability_provider: Any) -> None:
        """Configures observability (logging, tracing, metrics)."""
        # TODO: Implement observability setup (e.g., configuring LangSmith)
        print(f"LanggraphAgent: Setting observability provider: {observability_provider}")
        self._infos["observability_provider"] = str(observability_provider)
        # raise NotImplementedError("LanggraphAgent.set_observability not implemented.")

    def get_infos(self) -> Dict[str, Any]:
        """Returns information about the agent instance."""
        return self.infos # Accesses the property, which can be dynamic

    def get_workflow(self) -> Any:
        """Returns the definition or representation of the agent's workflow."""
        # TODO: Return the LangGraph graph definition or a representation of it.
        print("LanggraphAgent: Getting workflow.")
        # return self._agent_instance.graph. F(if applicable and accessible)
        raise NotImplementedError("LanggraphAgent.get_workflow not implemented.")

    def set_a2a_server(self, server_info: Dict[str, Any]) -> None:
        """Configures the agent-to-agent communication server."""
        print(f"LanggraphAgent: Setting A2A server info: {server_info}")
        self._a2a_server_details = server_info
        self._infos["a2a_server_configured"] = True
        # raise NotImplementedError("LanggraphAgent.set_a2a_server not implemented.")

    # Helper to construct session config for LangGraph, if needed
    def _get_session_config(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        # This is a conceptual helper. Actual session handling may vary.
        # If LangGraph uses thread_id for sessions:
        # current_session_id = session_id or getattr(self, "_current_session_id", str(uuid.uuid4()))
        # self._current_session_id = current_session_id # Store if managing sessions internally
        # return {"configurable": {"thread_id": current_session_id}}
        return {} 