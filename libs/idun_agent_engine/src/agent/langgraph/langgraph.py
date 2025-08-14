"""LangGraph agent adapter implementing the BaseAgent protocol."""

import importlib.util
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import aiosqlite
from ag_ui.core import events as ag_events
from ag_ui.core import types as ag_types
from idun_agent_engine import observability
from idun_agent_engine.agent import base as agent_base
from idun_agent_engine.agent.langgraph import langgraph_model as lg_model
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import StateGraph


class LanggraphAgent(agent_base.BaseAgent):
    """LangGraph agent adapter implementing the BaseAgent protocol."""

    def __init__(self):
        """Initialize an unconfigured LanggraphAgent with default state."""
        self._id = str(uuid.uuid4())
        self._agent_type = "LangGraph"
        self._input_schema: Any = None
        self._output_schema: Any = None
        self._agent_instance: Any = None
        self._checkpointer: Any = None
        self._store: Any = None
        self._connection: Any = None
        self._configuration: lg_model.LangGraphAgentConfig | None = None
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
    def configuration(self) -> lg_model.LangGraphAgentConfig:
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

    async def initialize(self, config: lg_model.LangGraphAgentConfig) -> None:
        """Initialize the LangGraph agent asynchronously."""
        self._configuration = lg_model.LangGraphAgentConfig.model_validate(config)

        self._name = self._configuration.name or "Unnamed LangGraph Agent"
        self._infos["name"] = self._name

        await self._setup_persistence()

        # Observability (provider-agnostic). Prefer generic block; fallback to legacy langfuse block.
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
            if isinstance(
                self._configuration.checkpointer, lg_model.SqliteCheckpointConfig
            ):
                self._connection = await aiosqlite.connect(
                    self._configuration.checkpointer.db_path
                )
                self._checkpointer = AsyncSqliteSaver(conn=self._connection)
                self._infos["checkpointer"] = (
                    self._configuration.checkpointer.model_dump()
                )
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
            ) from None

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
            raise ValueError(
                f"Failed to load agent from {graph_definition}: {e}"
            ) from e

        if not isinstance(graph_builder, StateGraph):
            raise TypeError(
                f"The variable '{graph_variable_name}' from {module_path} is not a StateGraph instance."
            )

        return graph_builder

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

        current_message_id = None
        current_tool_call_id = None
        tool_call_name = None
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
                        message_id=current_message_id,
                        role="assistant",
                    )

                if chunk.content:
                    yield ag_events.TextMessageContentEvent(
                        type=ag_events.EventType.TEXT_MESSAGE_CONTENT,
                        message_id=current_message_id,
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

                            current_tool_call_id = tc["id"]
                            tool_call_name = tc["function"]["name"]
                            yield ag_events.ToolCallStartEvent(
                                type=ag_events.EventType.TOOL_CALL_START,
                                tool_call_id=current_tool_call_id,
                                tool_call_name=tool_call_name,
                                parent_message_id=current_message_id,
                            )

                        if (
                            "function" in tc
                            and "arguments" in tc["function"]
                            and tc["function"]["arguments"]
                        ):
                            yield ag_events.ToolCallArgsEvent(
                                type=ag_events.EventType.TOOL_CALL_ARGS,
                                tool_call_id=current_tool_call_id,
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
                        tool_call_id=current_tool_call_id,
                    )
                    current_tool_call_id = None

                yield ag_events.StepFinishedEvent(
                    type=ag_events.EventType.STEP_FINISHED, step_name=name
                )
                tool_call_name = None

        if current_tool_call_id:
            yield ag_events.ToolCallEndEvent(
                type=ag_events.EventType.TOOL_CALL_END,
                tool_call_id=current_tool_call_id,
            )

        if current_message_id:
            yield ag_events.TextMessageEndEvent(
                type=ag_events.EventType.TEXT_MESSAGE_END, message_id=current_message_id
            )

        yield ag_events.RunFinishedEvent(
            type=ag_events.EventType.RUN_FINISHED, run_id=run_id, thread_id=thread_id
        )
