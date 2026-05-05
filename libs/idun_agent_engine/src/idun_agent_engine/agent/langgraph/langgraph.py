"""LangGraph agent adapter implementing the BaseAgent protocol."""

from __future__ import annotations

import importlib
import importlib.util
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ag_ui.core import BaseEvent
    from ag_ui.core.types import RunAgentInput
    from idun_agent_schema.engine.capabilities import AgentCapabilities

import aiosqlite
from ag_ui.core import events as ag_events
from ag_ui.core import types as ag_types
from ag_ui_langgraph import LangGraphAgent
from idun_agent_schema.engine.langgraph import (
    InMemoryCheckpointConfig,
    LangGraphAgentConfig,
    PostgresCheckpointConfig,
    SqliteCheckpointConfig,
)
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from idun_agent_schema.engine.sessions import (
    HistoryCapabilities,
    SessionDetail,
    SessionMessage,
    SessionSummary,
)
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph

from idun_agent_engine import observability
from idun_agent_engine.agent import base as agent_base

logger = logging.getLogger(__name__)


# WS3: state fields the engine itself injects from forwarded_props rather
# than the agent user. These are excluded from capability discovery's
# structured-vs-chat input mode decision. Add new sidecars here as the
# engine grows new forwarded-props features.
_SIDECAR_STATE_FIELDS = frozenset({"idun"})


def _extract_text_content(content: Any) -> str:
    """Normalise LLM message content to a plain-text string."""
    if isinstance(content, str):
        return content

    if not isinstance(content, list):
        return str(content)

    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif (
            isinstance(block, dict)
            and block.get("type") == "text"
            and isinstance(block.get("text"), str)
        ):
            parts.append(block["text"])
    return "".join(parts) if parts else str(content)


def _lc_messages_to_session(messages: list[Any]) -> list[SessionMessage]:
    """Map LangChain messages to text-only :class:`SessionMessage` rows.

    Per the agent-sessions spec §5: ``HumanMessage`` becomes role
    ``"user"``; ``AIMessage`` becomes role ``"assistant"``. ``ToolMessage``
    is dropped along with any message whose stringified content is empty.
    ``SystemMessage`` and other unexpected types are skipped — chat history
    is meant to mirror the user-facing transcript, not the internal scaffolding.
    """
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    out: list[SessionMessage] = []
    for m in messages:
        if isinstance(m, ToolMessage):
            continue
        # AIMessage.content can be a string OR a list of content blocks
        # (Gemini, Claude, etc.). Coalesce to a string.
        content = getattr(m, "content", "")
        if isinstance(content, list):
            text_parts = [
                p.get("text")
                for p in content
                if isinstance(p, dict) and isinstance(p.get("text"), str)
            ]
            content = "".join(t for t in text_parts if t)
        if not isinstance(content, str) or not content.strip():
            continue
        if isinstance(m, HumanMessage):
            role: str = "user"
        elif isinstance(m, AIMessage):
            role = "assistant"
        else:
            # Skip SystemMessage, FunctionMessage, and unknown types.
            continue
        out.append(
            SessionMessage(
                id=str(getattr(m, "id", None) or f"msg-{len(out)}"),
                role=role,  # type: ignore[arg-type]
                content=content,
                timestamp=None,  # LangChain messages don't carry timestamps
            )
        )
    return out


def _row_thread_id(row: Any) -> str | None:
    """Pull ``thread_id`` from a checkpoint row regardless of row factory.

    psycopg's ``AsyncPostgresSaver`` uses ``dict_row``; aiosqlite returns
    tuples. Try column-name access first, fall back to integer index.
    """
    try:
        return row["thread_id"]
    except (KeyError, TypeError, IndexError):
        pass
    try:
        return row[0]
    except (KeyError, IndexError, TypeError):
        return None


async def _enumerate_thread_ids(saver: Any, *, limit: int = 200) -> list[str]:
    """Recent thread ids from a LangGraph checkpointer.

    ``BaseCheckpointSaver`` has no public list-threads primitive
    (``alist`` returns checkpoint tuples, not distinct threads). Falls
    back to a ``GROUP BY thread_id`` against the saver's own
    ``checkpoints`` table for the savers we ship.
    """
    if isinstance(saver, InMemorySaver):
        storage = getattr(saver, "storage", None)
        if isinstance(storage, dict):
            return list(storage.keys())[:limit]
        return []

    if isinstance(saver, AsyncSqliteSaver):
        await saver.setup()
        async with saver.lock, saver.conn.cursor() as cur:
            await cur.execute(
                "SELECT thread_id, MAX(checkpoint_id) AS latest "
                "FROM checkpoints GROUP BY thread_id "
                "ORDER BY latest DESC LIMIT ?",
                (limit,),
            )
            rows = await cur.fetchall()
            return [tid for r in rows if (tid := _row_thread_id(r))]

    if isinstance(saver, AsyncPostgresSaver):
        async with saver.lock, saver.conn.cursor() as cur:
            await cur.execute(
                "SELECT thread_id, MAX(checkpoint_id) AS latest "
                "FROM checkpoints GROUP BY thread_id "
                "ORDER BY latest DESC LIMIT %s",
                (limit,),
            )
            rows = await cur.fetchall()
            return [tid for r in rows if (tid := _row_thread_id(r))]

    raise NotImplementedError(
        f"thread enumeration not supported for {type(saver).__name__}"
    )


def _state_last_update_time(state: Any) -> float | None:
    """Parse a ``StateSnapshot.created_at`` ISO-8601 string into epoch seconds.

    LangGraph's ``StateSnapshot.created_at`` is documented as ISO 8601 but
    the format varies between savers (Z-suffix vs. +00:00 vs. naive). Parse
    defensively and fall back to ``None`` rather than raising — last-update
    time is metadata, not a guarantee.
    """
    created_at = getattr(state, "created_at", None)
    if not isinstance(created_at, str):
        return None
    try:
        from datetime import datetime

        return datetime.fromisoformat(created_at.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):  # pragma: no cover - defensive
        return None


class LanggraphAgent(agent_base.BaseAgent):
    """LangGraph agent adapter implementing the BaseAgent protocol."""

    def __init__(self):
        """Initialize an unconfigured LanggraphAgent with default state."""
        super().__init__()
        self._id = str(uuid.uuid4())
        self._agent_type = "LangGraph"
        self._input_schema: Any = None
        self._output_schema: Any = None
        self._agent_instance: Any = None
        self._copilotkit_agent_instance: LangGraphAgent | None = None
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
        # Compile options extracted from CompiledStateGraph
        self._interrupt_before: list[str] | None = None
        self._interrupt_after: list[str] | None = None
        # Cached capabilities descriptor
        self._cached_capabilities: AgentCapabilities | None = None

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
    def copilotkit_agent_instance(self) -> LangGraphAgent:
        """Return the AG-UI LangGraph wrapper.

        Property name is retained for back-compat with the BaseAgent
        protocol; the underlying class is ``ag_ui_langgraph.LangGraphAgent``
        as of WS1 Task 7 (was ``copilotkit.LangGraphAGUIAgent`` before).

        Raises:
            RuntimeError: If the wrapper is not yet initialized.
        """
        if self._copilotkit_agent_instance is None:
            raise RuntimeError(
                "AG-UI LangGraph wrapper not initialized. Call initialize() first."
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

            # Fallback: use agent name as run_name if not explicitly configured
            if not self._obs_run_name:
                self._obs_run_name = self._name

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
            compile_kwargs: dict[str, Any] = {
                "checkpointer": self._checkpointer,
                "store": self._store,
                "name": self._obs_run_name or self._name,
            }
            # Preserve interrupt_before/after extracted from CompiledStateGraph
            if self._interrupt_before:
                compile_kwargs["interrupt_before"] = self._interrupt_before
            if self._interrupt_after:
                compile_kwargs["interrupt_after"] = self._interrupt_after

            self._agent_instance = graph_builder.compile(**compile_kwargs)

        self._copilotkit_agent_instance = LangGraphAgent(
            name=self._name,
            description="Agent description",  # TODO: add agent description
            graph=self._agent_instance,
            config={"callbacks": self._obs_callbacks} if self._obs_callbacks else None,
        )

        if self._agent_instance:
            try:
                self._input_schema = self._agent_instance.input_schema
                self._output_schema = self._agent_instance.output_schema
                self._infos["input_schema"] = str(self._input_schema)
                self._infos["output_schema"] = str(self._output_schema)
            except Exception:
                logger.warning("Could not parse schema")
                self._infos["input_schema"] = "Cannot extract schema"
                self._infos["output_schema"] = "Cannot extract schema"

        self._infos["status"] = "Initialized"
        self._infos["config_used"] = self._configuration.model_dump()

    async def close(self):
        """Closes any open resources, like database connections."""
        # Exit the Postgres context manager if we entered one
        pg_cm = getattr(self, "_pg_cm", None)
        if pg_cm is not None:
            await pg_cm.__aexit__(None, None, None)
            self._pg_cm = None
            logger.debug("Postgres checkpointer connection closed.")
        if self._connection:
            await self._connection.close()
            self._connection = None
            logger.debug("Database connection closed.")

    async def _setup_persistence(self) -> None:
        """Configures the agent's persistence (checkpoint and store) asynchronously."""
        if not self._configuration:
            return

        if self._configuration.checkpointer:
            if isinstance(self._configuration.checkpointer, SqliteCheckpointConfig):
                db_path = self._configuration.checkpointer.db_url.replace(
                    "sqlite:///", ""
                )
                self._connection = await aiosqlite.connect(db_path)
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
                # from_conn_string is an async context manager; enter it and
                # keep a reference so we can clean up on shutdown.
                self._pg_cm = AsyncPostgresSaver.from_conn_string(
                    self._configuration.checkpointer.db_url
                )
                self._checkpointer = await self._pg_cm.__aenter__()
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
        if isinstance(graph_builder, CompiledStateGraph):
            if not hasattr(graph_builder, "builder"):
                raise TypeError(
                    f"CompiledStateGraph from {module_path}:{graph_variable_name} "
                    "does not expose .builder. Export the uncompiled StateGraph directly."
                )

            # NOTE: .builder is an internal LangGraph attribute (not in public API docs).
            # Verified on langgraph 1.x. If LangGraph removes or renames it, the
            # hasattr check above will catch it and raise a clear error.
            logger.warning(
                "Received a CompiledStateGraph for '%s' from %s — extracting the "
                "original StateGraph via .builder and recompiling with the "
                "engine-managed checkpointer/store. Consider exporting the "
                "uncompiled StateGraph directly.",
                graph_variable_name,
                module_path,
            )

            # Preserve interrupt_before/after from the user's compile() call
            self._interrupt_before = (
                getattr(graph_builder, "interrupt_before_nodes", None) or None
            )
            self._interrupt_after = (
                getattr(graph_builder, "interrupt_after_nodes", None) or None
            )

            if self._interrupt_before or self._interrupt_after:
                logger.info(
                    "Preserving compile options from CompiledStateGraph: "
                    "interrupt_before=%s, interrupt_after=%s",
                    self._interrupt_before,
                    self._interrupt_after,
                )

            return graph_builder.builder
        if not isinstance(graph_builder, StateGraph):
            raise TypeError(
                f"The variable '{graph_variable_name}' from {module_path} is not a StateGraph instance."
            )
        return graph_builder

    # TODO: DEPRECATED — remove when shim routes are removed
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
                return _extract_text_content(response_message.content)
            if isinstance(response_message, dict) and "content" in response_message:
                return _extract_text_content(response_message["content"])
            if isinstance(response_message, tuple) and len(response_message) >= 2:
                return str(response_message[1])

        return output

    # TODO: DEPRECATED — remove when shim routes are removed
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

    def discover_capabilities(self) -> AgentCapabilities:
        """Introspect the compiled graph for input/output schemas."""
        if self._cached_capabilities is not None:
            return self._cached_capabilities

        from idun_agent_schema.engine.agent_framework import AgentFramework
        from idun_agent_schema.engine.capabilities import (
            AgentCapabilities,
            CapabilityFlags,
            InputDescriptor,
            OutputDescriptor,
        )

        graph = self._agent_instance  # This is the compiled StateGraph

        # Get input/output schemas from compiled graph.
        # LangGraph wraps them in Pydantic wrapper models (LangGraphInput /
        # LangGraphOutput).  When a separate input/output TypedDict was
        # supplied to ``StateGraph(state, input=..., output=...)``, the
        # wrapper's ``model_fields`` contain a single ``root`` entry whose
        # annotation is the original TypedDict.  Otherwise the wrapper
        # directly exposes the state fields.
        #
        # Schema materialization goes through ``pydantic.create_model`` on
        # the state annotations.  That can fail on valid LangGraph state
        # schemas whose annotations use TypedDict-only qualifiers like
        # ``NotRequired`` (e.g. LangChain's ``PlanningState`` used by
        # DeepAgents' ``TodoListMiddleware`` triggers
        # ``PydanticForbiddenQualifier``).  Schema introspection is
        # metadata — a failure here must not take down the runtime.  Fall
        # back to chat/text mode and cache the fallback so subsequent calls
        # are O(1) and ``/agent/run`` keeps streaming.
        try:
            input_schema_cls = getattr(graph, "input_schema", None)
            output_schema_cls = getattr(graph, "output_schema", None)
            input_fields = self._unwrap_schema_fields(input_schema_cls)
            output_fields = self._unwrap_schema_fields(output_schema_cls)
        except Exception as e:
            logger.warning(
                "Graph schema introspection failed (%s: %s). Falling back "
                "to chat/text capabilities. Streaming is unaffected. This "
                "is commonly seen with LangChain middleware that uses "
                "TypedDict-only qualifiers (e.g. DeepAgents + PlanningState).",
                type(e).__name__,
                e,
            )
            input_schema_cls = None
            output_schema_cls = None
            input_fields = None
            output_fields = None

        # Detect input mode
        # WS3: exclude sidecar fields (engine-injected, not user-supplied
        # structured input) when computing whether the agent is "chat" or
        # "structured" mode. Today the only sidecar is `idun`, which carries
        # forwarded_props.idun (A2UI v0.9 client_to_server message + dataModel
        # snapshot). Without this filter, every WS3-action-aware agent would
        # incorrectly report structured-input mode and reject plain-text user
        # turns.
        input_mode = "chat"
        input_json_schema = None
        if input_fields is not None:
            user_fields = set(input_fields) - _SIDECAR_STATE_FIELDS
            has_messages = "messages" in user_fields
            only_messages = has_messages and len(user_fields) == 1

            if only_messages:
                input_mode = "chat"
            else:
                input_mode = "structured"
                input_json_schema = self._schema_to_json_schema(input_schema_cls)

        # Detect output mode
        output_mode = "text"
        output_json_schema = None
        if (
            output_fields is not None
            and output_schema_cls is not None
            and output_schema_cls != input_schema_cls
        ):
            only_messages = "messages" in output_fields and len(output_fields) == 1
            if not only_messages:
                output_mode = "structured"
                output_json_schema = self._schema_to_json_schema(output_schema_cls)

        has_checkpointer = self._checkpointer is not None

        result = AgentCapabilities(
            version="1",
            framework=AgentFramework.LANGGRAPH,
            capabilities=CapabilityFlags(
                streaming=True,
                history=has_checkpointer,
                thread_id=has_checkpointer,
            ),
            input=InputDescriptor(mode=input_mode, schema_=input_json_schema),
            output=OutputDescriptor(mode=output_mode, schema_=output_json_schema),
            history=self.history_capabilities(),
        )
        self._cached_capabilities = result
        return result

    def history_capabilities(self) -> HistoryCapabilities:
        """Declare LangGraph session-history support.

        Listing and detail are both supported when a checkpointer is wired
        (memory / sqlite / postgres). With no checkpointer there is no
        durable thread state, so both flags collapse to ``False``.
        """
        has_memory = self._checkpointer is not None
        return HistoryCapabilities(can_list=has_memory, can_get=has_memory)

    async def list_sessions(
        self, *, user_id: str | None = None
    ) -> list[SessionSummary]:
        """List threads via internal-API peek on the configured checkpointer.

        ``user_id`` is accepted but ignored: LangGraph checkpointers have no
        user-id concept, so summaries always report ``user_id=None``. Per
        spec §5, listing is single-user; multi-tenant scoping is deferred
        until LangGraph adds first-class thread metadata.

        Returns an empty list if no checkpointer is wired or the saver type
        does not expose enumeration (a warning is logged for the latter).
        """
        if not self._checkpointer:
            return []

        try:
            thread_ids = await _enumerate_thread_ids(self._checkpointer)
        except NotImplementedError as exc:
            logger.warning("Cannot enumerate LangGraph threads: %s", exc)
            return []

        out: list[SessionSummary] = []
        for tid in thread_ids:
            detail = await self.get_session(tid)
            if detail is None:
                continue
            first = next((m for m in detail.messages if m.role == "user"), None)
            out.append(
                SessionSummary(
                    id=tid,
                    last_update_time=detail.last_update_time,
                    user_id=None,
                    thread_id=tid,
                    preview=(first.content[:120] if first else None),
                )
            )
        return out

    async def get_session(
        self, session_id: str, *, user_id: str | None = None
    ) -> SessionDetail | None:
        """Reconstruct a single thread's text-only message transcript.

        Uses the public ``aget_state`` API on the compiled graph. ``user_id``
        is accepted for API symmetry but ignored (single-user scoping —
        see :meth:`list_sessions`). Returns ``None`` when the agent is not
        initialized, no checkpointer is wired, the thread has no state,
        or ``aget_state`` raises (e.g. invalid thread id).
        """
        if not self._agent_instance or not self._checkpointer:
            return None

        config: dict[str, Any] = {"configurable": {"thread_id": session_id}}
        try:
            state = await self._agent_instance.aget_state(config)
        except Exception as exc:  # noqa: BLE001 - upstream raises broad errors
            logger.warning("aget_state failed for thread %s: %s", session_id, exc)
            return None

        if state is None:
            return None

        values = getattr(state, "values", None) or {}
        msgs = values.get("messages") if isinstance(values, dict) else None
        if not msgs:
            return None

        return SessionDetail(
            id=session_id,
            last_update_time=_state_last_update_time(state),
            user_id=None,
            thread_id=session_id,
            messages=_lc_messages_to_session(msgs),
        )

    @staticmethod
    def _unwrap_schema_fields(schema_cls: type | None) -> dict[str, Any] | None:
        """Extract the logical field names from a LangGraph schema wrapper.

        LangGraph compiles ``StateGraph`` state definitions into Pydantic
        wrapper models.  When a dedicated input/output TypedDict was
        provided, the wrapper has a single ``root`` field whose annotation
        is the original TypedDict.  This helper unwraps that indirection so
        callers always see the user-defined field names.
        """
        if schema_cls is None:
            return None

        model_fields = getattr(schema_cls, "model_fields", {})
        if not model_fields:
            return getattr(schema_cls, "__annotations__", {}) or None

        # If there is a single ``root`` field, unwrap it.
        if list(model_fields.keys()) == ["root"]:
            root_type = model_fields["root"].annotation
            return getattr(root_type, "__annotations__", {}) or model_fields

        return {k: v for k, v in model_fields.items()}

    @staticmethod
    def _schema_to_json_schema(schema_class: type) -> dict:
        """Convert a Pydantic model or TypedDict to JSON Schema."""
        if hasattr(schema_class, "model_json_schema"):
            return schema_class.model_json_schema()
        # TypedDict — build schema from annotations
        properties = {}
        required = []
        annotations = getattr(schema_class, "__annotations__", {})
        type_map = {
            "str": "string",
            "int": "integer",
            "float": "number",
            "bool": "boolean",
        }
        for field_name, field_type in annotations.items():
            type_name = getattr(field_type, "__name__", str(field_type))
            json_type = type_map.get(type_name, "string")
            properties[field_name] = {"type": json_type}
            required.append(field_name)
        return {"type": "object", "properties": properties, "required": required}

    async def run(self, input_data: RunAgentInput) -> AsyncGenerator[BaseEvent, None]:
        """Canonical AG-UI interaction entry point.

        Delegates to LangGraphAGUIAgent for event generation. For structured
        agents, validates input against the discovered input schema first.
        """
        import json as json_module

        from ag_ui.core import EventType, RunErrorEvent

        capabilities = self.discover_capabilities()

        # Validate structured input
        if capabilities.input.mode == "structured" and input_data.messages:
            last_msg = input_data.messages[-1]
            content = str(last_msg.content) if last_msg.content else ""
            try:
                json_module.loads(content)
            except (json_module.JSONDecodeError, TypeError) as e:
                yield RunErrorEvent(
                    type=EventType.RUN_ERROR,
                    message=f"Structured input must be valid JSON: {e}",
                    code="VALIDATION_ERROR",
                )
                return

        # Delegate to the AG-UI wrapper
        copilotkit_agent = self.copilotkit_agent_instance
        async for event in copilotkit_agent.run(input_data):
            yield event
