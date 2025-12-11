"""LangGraph agent adapter implementing the BaseAgent protocol."""

import importlib.util
import importlib
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import aiosqlite
from ag_ui.core import events as ag_events
from ag_ui.core import types as ag_types
from idun_agent_schema.engine.langgraph import (
    InMemoryCheckpointConfig,
    LangGraphAgentConfig,
    PostgresCheckpointConfig,
    SqliteCheckpointConfig,
)
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph

from idun_agent_engine import observability
from idun_agent_engine.agent import base as agent_base
from copilotkit import LangGraphAGUIAgent


class LanggraphAgent(agent_base.BaseAgent):
    """LangGraph agent adapter implementing the BaseAgent protocol."""

    def __init__(self):
        """Initialize an unconfigured LanggraphAgent with default state."""
        self._id = str(uuid.uuid4())
        self._agent_type = "LangGraph"
        self._input_schema: Any = None
        self._output_schema: Any = None
        self._agent_instance: Any = None
        self._copilotkit_agent_instance: LangGraphAGUIAgent | None = None
        self._checkpointer: Any = None
        self._store: Any = None
        self._connection: Any = None
        self._configuration: LangGraphAgentConfig | None = None
        self._name: str = "Unnamed LangGraph Agent"
        self._infos: dict[str, Any] = {
            "status": "Uninitialized",
            "name": self._name,
            "id": self._id,
        }
        # Observability (provider-agnostic)
        self._obs_callbacks: list[Any] | None = None
        self._obs_run_name: str | None = None

    @property
    def id(self) -> str:
        """Return unique identifier for this agent instance."""
        return self._id

    @property
    def agent_type(self) -> str:
        """Return agent type label."""
        return self._agent_type

    @property
    def name(self) -> str:
        """Return configured human-readable agent name."""
        return self._name

    @property
    def input_schema(self) -> Any:
        """Return input schema provided by underlying graph if available."""
        return self._input_schema

    @property
    def output_schema(self) -> Any:
        """Return output schema provided by underlying graph if available."""
        return self._output_schema

    @property
    def agent_instance(self) -> Any:
        """Return compiled graph instance.

        Raises:
            RuntimeError: If the agent is not yet initialized.
        """
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() first.")
        return self._agent_instance

    @property
    def copilotkit_agent_instance(self) -> LangGraphAGUIAgent:
        """Return the CopilotKit agent instance.

        Raises:
            RuntimeError: If the CopilotKit agent is not yet initialized.
        """
        if self._copilotkit_agent_instance is None:
            raise RuntimeError(
                "CopilotKit agent not initialized. Call initialize() first."
            )
        return self._copilotkit_agent_instance

    @property
    def configuration(self) -> LangGraphAgentConfig:
        """Return validated configuration.

        Raises:
            RuntimeError: If the agent has not been configured yet.
        """
        if not self._configuration:
            raise RuntimeError("Agent not configured. Call initialize() first.")
        return self._configuration

    @property
    def infos(self) -> dict[str, Any]:
        """Return diagnostic information about the agent instance."""
        self._infos["underlying_agent_type"] = (
            str(type(self._agent_instance)) if self._agent_instance else "N/A"
        )
        return self._infos

    async def initialize(
        self,
        config: LangGraphAgentConfig,
        observability_config: list[ObservabilityConfig] | None = None,
    ) -> None:
        """Initialize the LangGraph agent asynchronously."""
        self._configuration = LangGraphAgentConfig.model_validate(config)

        self._name = self._configuration.name or "Unnamed LangGraph Agent"
        self._infos["name"] = self._name

        await self._setup_persistence()

        # Observability (provider-agnostic)
        if observability_config:
            handlers, infos = observability.create_observability_handlers(
                observability_config  # type: ignore[arg-type]
            )
            self._obs_callbacks = []
            for handler in handlers:
                self._obs_callbacks.extend(handler.get_callbacks())
                # Use the first run name found if not set
                if not self._obs_run_name:
                    self._obs_run_name = handler.get_run_name()

            if infos:
                self._infos["observability"] = infos

        # Fallback to legacy generic block or langfuse block if no new observability config provided
        elif getattr(self._configuration, "observability", None) or getattr(
            self._configuration, "langfuse", None
        ):
            obs_cfg = None
            try:
                if getattr(self._configuration, "observability", None):
                    obs_cfg = self._configuration.observability.resolved()  # type: ignore[attr-defined]
                elif getattr(self._configuration, "langfuse", None):
                    lf = self._configuration.langfuse.resolved()  # type: ignore[attr-defined]
                    obs_cfg = type(
                        "_Temp",
                        (),
                        {
                            "provider": "langfuse",
                            "enabled": lf.enabled,
                            "options": {
                                "host": lf.host,
                                "public_key": lf.public_key,
                                "secret_key": lf.secret_key,
                                "run_name": lf.run_name,
                            },
                        },
                    )()
            except Exception:
                obs_cfg = None

            if obs_cfg and getattr(obs_cfg, "enabled", False):
                provider = getattr(obs_cfg, "provider", None)
                options = dict(getattr(obs_cfg, "options", {}) or {})
                # Fallback: if using Langfuse and run_name is not provided, use agent name
                if provider == "langfuse" and not options.get("run_name"):
                    options["run_name"] = self._name

                handler, info = observability.create_observability_handler(
                    {
                        "provider": provider,
                        "enabled": True,
                        "options": options,
                    }
                )
                if handler:
                    self._obs_callbacks = handler.get_callbacks()
                    self._obs_run_name = handler.get_run_name()
                if info:
                    self._infos["observability"] = dict(info)

        graph_builder = self._load_graph_builder(self._configuration.graph_definition)
        self._infos["graph_definition"] = self._configuration.graph_definition

        if isinstance(graph_builder, StateGraph):
            self._agent_instance = graph_builder.compile(
                checkpointer=self._checkpointer, store=self._store
            )
        elif isinstance(graph_builder, CompiledStateGraph): # TODO: to remove, dirty fix for template deepagent langgraph
            self._agent_instance = graph_builder

        self._copilotkit_agent_instance = LangGraphAGUIAgent(
            name=self._name,
            description="Agent description",  # TODO: add agent description
            graph=self._agent_instance,
            config={"callbacks": self._obs_callbacks} if self._obs_callbacks else None,
        )

        self._copilotkit_agent_instance = LangGraphAGUIAgent(
            name=self._name,
            description="Agent description", # TODO: add agent description
            graph=self._agent_instance,
        )

        if self._agent_instance:
            try:
                self._input_schema = self._agent_instance.input_schema
                self._output_schema = self._agent_instance.output_schema
                self._infos["input_schema"] = str(self._input_schema)
                self._infos["output_schema"] = str(self._output_schema)
            except Exception:
                print("Could not parse schema")
                self._input_schema = self._configuration.input_schema_definition
                self._output_schema = self._configuration.output_schema_definition
                self._infos["input_schema"] = "Cannot extract schema"
                self._infos["output_schema"] = "Cannot extract schema"

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
                self._connection = await aiosqlite.connect(
                    self._configuration.checkpointer.db_path
                )
                self._checkpointer = AsyncSqliteSaver(conn=self._connection)
                self._infos["checkpointer"] = (
                    self._configuration.checkpointer.model_dump()
                )
            elif isinstance(self._configuration.checkpointer, InMemoryCheckpointConfig):
                self._checkpointer = InMemorySaver()
                self._infos["checkpointer"] = (
                    self._configuration.checkpointer.model_dump()
                )
            elif isinstance(self._configuration.checkpointer, PostgresCheckpointConfig):
                self._checkpointer = AsyncPostgresSaver.from_conn_string(
                    self._configuration.checkpointer.db_url
                )
                await self._checkpointer.setup()
                self._infos["checkpointer"] = (
                    self._configuration.checkpointer.model_dump()
                )
            else:
                raise NotImplementedError(
                    f"Checkpointer type {type(self._configuration.checkpointer)} is not supported."
                )

        if self._configuration.store:
            raise NotImplementedError("Store functionality is not yet implemented.")

    def _load_graph_builder(self, graph_definition: str) -> StateGraph:
        """Loads a StateGraph instance from a specified path."""
        try:
            module_path, graph_variable_name = graph_definition.rsplit(":", 1)
            if not module_path.endswith(".py"):
                module_path += ".py"
        except ValueError:
            raise ValueError(
                "graph_definition must be in the format 'path/to/file.py:variable_name'"
            ) from None

        # Try loading as a file path first
        try:
            import os

            print("Current directory: ", os.getcwd())  # TODO remove
            from pathlib import Path

            resolved_path = Path(module_path).resolve()
            # If the file doesn't exist, it might be a python module path
            if not resolved_path.exists():
                raise FileNotFoundError

            spec = importlib.util.spec_from_file_location(
                graph_variable_name, str(resolved_path)
            )
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load spec for module at {module_path}")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            graph_builder = getattr(module, graph_variable_name)
            return self._validate_graph_builder(
                graph_builder, module_path, graph_variable_name
            )

        except (FileNotFoundError, ImportError):
            # Fallback: try loading as a python module
            try:
                module_import_path = (
                    module_path[:-3] if module_path.endswith(".py") else module_path
                )
                module = importlib.import_module(module_import_path)
                graph_builder = getattr(module, graph_variable_name)
                return self._validate_graph_builder(
                    graph_builder, module_path, graph_variable_name
                )
            except ImportError as e:
                raise ValueError(
                    f"Failed to load agent from {graph_definition}. Checked file path and python module: {e}"
                ) from e
            except AttributeError as e:
                raise ValueError(
                    f"Variable '{graph_variable_name}' not found in module {module_path}: {e}"
                ) from e
        except Exception as e:
            raise ValueError(
                f"Failed to load agent from {graph_definition}: {e}"
            ) from e

    def _validate_graph_builder(
        self, graph_builder: Any, module_path: str, graph_variable_name: str
    ) -> StateGraph:
        # TODO to remove, dirty fix for template deepagent langgraph
        if not isinstance(graph_builder, StateGraph) and not isinstance(
            graph_builder, CompiledStateGraph
        ):
            raise TypeError(
                f"The variable '{graph_variable_name}' from {module_path} is not a StateGraph instance."
            )
        return graph_builder  # type: ignore[return-value]

    async def invoke(self, message: Any) -> Any:
        """Process a single input to chat with the agent.

        The message should be a dictionary containing 'query' and 'session_id'.
        """
        if self._agent_instance is None:
            raise RuntimeError(
                "Agent not initialized. Call initialize() before processing messages."
            )

        if (
            not isinstance(message, dict)
            or "query" not in message
            or "session_id" not in message
        ):
            raise ValueError(
                "Message must be a dictionary with 'query' and 'session_id' keys."
            )

        graph_input = {"messages": [("user", message["query"])]}
        config: dict[str, Any] = {"configurable": {"thread_id": message["session_id"]}}
        if self._obs_callbacks:
            config["callbacks"] = self._obs_callbacks
            if self._obs_run_name:
                config["run_name"] = self._obs_run_name

        output = await self._agent_instance.ainvoke(graph_input, config)

        if output and "messages" in output and output["messages"]:
            response_message = output["messages"][-1]
            if hasattr(response_message, "content"):
                return response_message.content
            elif isinstance(response_message, dict) and "content" in response_message:
                return response_message["content"]
            elif isinstance(response_message, tuple):
                return response_message[1]
            else:
                # No usable content attribute; fall through to returning raw output
                pass

        return output

    async def stream(self, message: Any) -> AsyncGenerator[Any]:
        """Processes a single input message and returns a stream of ag-ui events."""
        if self._agent_instance is None:
            raise RuntimeError(
                "Agent not initialized. Call initialize() before processing messages."
            )

        if isinstance(message, dict) and "query" in message and "session_id" in message:
            run_id = f"run_{uuid.uuid4()}"
            thread_id = message["session_id"]
            user_message = ag_types.UserMessage(
                id=f"msg_{uuid.uuid4()}", role="user", content=message["query"]
            )
            graph_input = {
                "messages": [user_message.model_dump(by_alias=True, exclude_none=True)]
            }
        else:
            raise ValueError(
                "Unsupported message format for process_message_stream. Expects {'query': str, 'session_id': str}"
            )

        config: dict[str, Any] = {"configurable": {"thread_id": thread_id}}
        if self._obs_callbacks:
            config["callbacks"] = self._obs_callbacks
            if self._obs_run_name:
                config["run_name"] = self._obs_run_name

        current_message_id: str | None = None
        current_tool_call_id: str | None = None
        tool_call_name: str | None = None
        current_step_name = None

        async for event in self._agent_instance.astream_events(
            graph_input, config=config, version="v2"
        ):
            kind = event["event"]
            name = event["name"]

            if kind == "on_chain_start":
                current_step_name = name
                if current_step_name.lower() == "langgraph":
                    yield ag_events.RunStartedEvent(
                        type=ag_events.EventType.RUN_STARTED,
                        run_id=run_id,
                        thread_id=thread_id,
                    )
                else:
                    yield ag_events.StepStartedEvent(
                        type=ag_events.EventType.STEP_STARTED, step_name=name
                    )

            elif kind == "on_chain_end":
                if current_step_name:
                    yield ag_events.StepFinishedEvent(
                        type=ag_events.EventType.STEP_FINISHED, step_name=name
                    )
                    current_step_name = None

            elif kind == "on_llm_start":
                yield ag_events.ThinkingStartEvent(
                    type=ag_events.EventType.THINKING_START,
                    title=f"Thinking with {name}...",
                )

            elif kind == "on_llm_end":
                yield ag_events.ThinkingEndEvent(type=ag_events.EventType.THINKING_END)

            elif kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if not current_message_id and (chunk.content or chunk.tool_calls):
                    current_message_id = f"msg_{uuid.uuid4()}"
                    yield ag_events.TextMessageStartEvent(
                        type=ag_events.EventType.TEXT_MESSAGE_START,
                        message_id=current_message_id or "",
                        role="assistant",
                    )

                if chunk.content:
                    yield ag_events.TextMessageContentEvent(
                        type=ag_events.EventType.TEXT_MESSAGE_CONTENT,
                        message_id=current_message_id or "",
                        delta=chunk.content,
                    )

                if chunk.tool_calls:
                    for tc in chunk.tool_calls:
                        if "id" in tc and tc["id"] != current_tool_call_id:
                            if (
                                current_tool_call_id
                            ):  # End previous tool call if a new one starts
                                yield ag_events.ToolCallEndEvent(
                                    type=ag_events.EventType.TOOL_CALL_END,
                                    tool_call_id=current_tool_call_id,
                                )

                            current_tool_call_id = (
                                str(tc["id"]) if tc.get("id") is not None else None
                            )
                            tool_call_name = (
                                str(tc["function"]["name"])
                                if tc.get("function")
                                and tc["function"].get("name") is not None
                                else None
                            )
                            yield ag_events.ToolCallStartEvent(
                                type=ag_events.EventType.TOOL_CALL_START,
                                tool_call_id=current_tool_call_id or "",
                                tool_call_name=tool_call_name or "",
                                parent_message_id=current_message_id or "",
                            )

                        if (
                            "function" in tc
                            and "arguments" in tc["function"]
                            and tc["function"]["arguments"]
                        ):
                            yield ag_events.ToolCallArgsEvent(
                                type=ag_events.EventType.TOOL_CALL_ARGS,
                                tool_call_id=current_tool_call_id or "",
                                delta=tc["function"]["arguments"],
                            )

            elif kind == "on_tool_start":
                yield ag_events.StepStartedEvent(
                    type=ag_events.EventType.STEP_STARTED, step_name=name
                )

            elif kind == "on_tool_end":
                # Tool end event from langgraph has the tool output, but ag-ui model doesn't have a place for it in ToolCallEndEvent
                if current_tool_call_id:
                    yield ag_events.ToolCallEndEvent(
                        type=ag_events.EventType.TOOL_CALL_END,
                        tool_call_id=current_tool_call_id or "",
                    )
                    current_tool_call_id = None

                yield ag_events.StepFinishedEvent(
                    type=ag_events.EventType.STEP_FINISHED, step_name=name
                )
                tool_call_name = None

        if current_tool_call_id:
            yield ag_events.ToolCallEndEvent(
                type=ag_events.EventType.TOOL_CALL_END,
                tool_call_id=current_tool_call_id or "",
            )

        if current_message_id:
            yield ag_events.TextMessageEndEvent(
                type=ag_events.EventType.TEXT_MESSAGE_END,
                message_id=current_message_id or "",
            )

        yield ag_events.RunFinishedEvent(
            type=ag_events.EventType.RUN_FINISHED, run_id=run_id, thread_id=thread_id
        )
