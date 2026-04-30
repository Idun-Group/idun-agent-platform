"""ADK agent adapter implementing the BaseAgent protocol."""

from __future__ import annotations

import importlib.util
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ag_ui.core import BaseEvent
    from ag_ui.core.types import RunAgentInput
    from idun_agent_schema.engine.capabilities import AgentCapabilities

from ag_ui_adk import ADKAgent as ADKAGUIAgent
from google.adk.apps.app import App
from google.adk.events import Event
from google.adk.memory import (
    InMemoryMemoryService,
    VertexAiMemoryBankService,
)
from google.adk.runners import Runner
from google.adk.sessions import (
    DatabaseSessionService,
    InMemorySessionService,
    VertexAiSessionService,
)
from google.genai import types
from idun_agent_schema.engine.adk import (
    AdkAgentConfig,
    AdkDatabaseSessionConfig,
    AdkInMemoryMemoryConfig,
    AdkInMemorySessionConfig,
    AdkVertexAiMemoryConfig,
    AdkVertexAiSessionConfig,
)
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from idun_agent_schema.engine.sessions import (
    HistoryCapabilities,
    SessionDetail,
    SessionMessage,
    SessionSummary,
)
from pydantic import BaseModel

from idun_agent_engine import observability
from idun_agent_engine.agent import base as agent_base
from idun_agent_engine.identity import current_user_id

logger = logging.getLogger(__name__)


def _event_text_parts(event: Any) -> list[str]:
    """Extract non-empty text fragments from an ADK event's content parts."""
    content = getattr(event, "content", None)
    if content is None:
        return []
    parts = getattr(content, "parts", None) or []
    out: list[str] = []
    for p in parts:
        text = getattr(p, "text", None)
        if isinstance(text, str) and text.strip():
            out.append(text)
    return out


def _first_user_text(session: Any) -> str | None:
    """First user-authored text in the session, ~120 chars."""
    for ev in getattr(session, "events", []) or []:
        if getattr(ev, "author", None) != "user":
            continue
        texts = _event_text_parts(ev)
        if texts:
            preview = " ".join(texts).strip()
            return preview[:120]
    return None


def _events_to_messages(events: list[Any]) -> list[SessionMessage]:
    """Map ADK events to text-only ``SessionMessage`` rows.

    Per the agent-sessions spec §5: drop tool calls, structured outputs,
    and any event with no text content. Author ``"user"`` maps to
    role ``"user"``; everything else maps to ``"assistant"``.
    """
    msgs: list[SessionMessage] = []
    for ev in events:
        texts = _event_text_parts(ev)
        if not texts:
            continue
        role = "user" if getattr(ev, "author", None) == "user" else "assistant"
        msgs.append(
            SessionMessage(
                id=str(getattr(ev, "id", "") or f"msg-{len(msgs)}"),
                role=role,
                content="".join(texts),
                timestamp=getattr(ev, "timestamp", None),
            )
        )
    return msgs


def _describe_mcp_params(params: object) -> str | None:
    """Best-effort label for an MCPToolset connection params object."""
    if params is None:
        return None
    cmd = getattr(params, "command", None)
    args = getattr(params, "args", None)
    if cmd is not None:
        joined = " ".join(args or [])
        return f"stdio: {cmd} {joined}".strip()
    url = getattr(params, "url", None)
    if url is not None:
        return f"http: {url}"
    return type(params).__name__


class AdkAgent(agent_base.BaseAgent):
    """ADK agent adapter implementing the BaseAgent protocol."""

    def __init__(self):
        """Initialize an unconfigured AdkAgent with default state."""
        super().__init__()
        self._id = str(uuid.uuid4())
        self._agent_type = "ADK"
        self._agent_instance: Any = None
        self._copilotkit_agent_instance: ADKAGUIAgent | None = None
        self._configuration: AdkAgentConfig | None = None
        self._name: str = "Unnamed ADK Agent"
        self._infos: dict[str, Any] = {
            "status": "Uninitialized",
            "name": self._name,
            "id": self._id,
        }
        self._session_service: Any = None
        self._memory_service: Any = None
        # Observability (provider-agnostic)
        self._obs_callbacks: list[Any] | None = None
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
    def agent_instance(self) -> Any:
        """Return the underlying ADK agent instance.

        Raises:
            RuntimeError: If the agent is not yet initialized.
        """
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() first.")
        return self._agent_instance

    @property
    def copilotkit_agent_instance(self) -> ADKAGUIAgent:
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
    def configuration(self) -> AdkAgentConfig:
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
        config: AdkAgentConfig,
        observability_config: list[ObservabilityConfig] | None = None,
    ) -> None:
        """Initialize the ADK agent asynchronously."""
        self._configuration = AdkAgentConfig.model_validate(config)

        self._name = self._configuration.app_name or "Unnamed ADK Agent"
        self._infos["name"] = self._name

        # Observability (provider-agnostic)
        if observability_config:
            handlers, infos = observability.create_observability_handlers(
                observability_config  # type: ignore[arg-type]
            )
            self._obs_callbacks = []
            for handler in handlers:
                # Even if callbacks aren't used by ADK directly, instantiating the handler
                # might set up global instrumentation (e.g. Phoenix, Langfuse env vars).
                self._obs_callbacks.extend(handler.get_callbacks())

            if infos:
                self._infos["observability"] = infos

        if observability_config:
            try:
                # Check if langfuse is enabled in any of the observability configs
                def _is_langfuse_provider(c: Any) -> bool:
                    provider = getattr(c, "provider", None)
                    if provider is None and isinstance(c, dict):
                        provider = c.get("provider")

                    if provider is not None and hasattr(provider, "value"):
                        provider = provider.value

                    return str(provider).lower() == "langfuse"

                is_langfuse_enabled = any(
                    _is_langfuse_provider(config) for config in observability_config
                )

                if is_langfuse_enabled:
                    import os

                    langfuse_pk = os.environ.get("LANGFUSE_PUBLIC_KEY")
                    langfuse_host = os.environ.get("LANGFUSE_BASE_URL")
                    logger.debug(f"LANGFUSE_PUBLIC_KEY: {langfuse_pk}")
                    logger.debug(f"LANGFUSE_BASE_URL: {langfuse_host}")
                    try:
                        from openinference.instrumentation.google_adk import (
                            GoogleADKInstrumentor,
                        )

                        GoogleADKInstrumentor().instrument()
                        logger.info("GoogleADKInstrumentor instrumented successfully.")
                    except ImportError:
                        logger.warning(
                            "openinference-instrumentation-google-adk not installed, skipping Google ADK instrumentation."
                        )
                    except Exception as e:
                        logger.warning(f"Failed to instrument Google ADK: {e}")
            except Exception as e:
                logger.warning(
                    f"Error checking observability config for ADK instrumentation: {e}"
                )

        if observability_config:
            try:

                def _is_langsmith_provider(c: Any) -> bool:
                    provider = getattr(c, "provider", None)
                    if provider is None and isinstance(c, dict):
                        provider = c.get("provider")
                    if provider is not None and hasattr(provider, "value"):
                        provider = provider.value
                    return str(provider).lower() == "langsmith"

                is_langsmith_enabled = any(
                    _is_langsmith_provider(config) for config in observability_config
                )

                if is_langsmith_enabled:
                    try:
                        from langsmith.integrations.google_adk import (
                            configure_google_adk,
                        )

                        if configure_google_adk(name=self._name):
                            logger.info("LangSmith Google ADK integration configured")
                        else:
                            logger.warning(
                                "LangSmith Google ADK integration failed to configure"
                            )
                    except ImportError:
                        logger.warning(
                            "langsmith[google-adk] not installed, "
                            "skipping ADK instrumentation"
                        )
                    except Exception as e:
                        logger.warning(f"Failed to configure LangSmith ADK: {e}")
            except Exception as e:
                logger.warning(
                    f"Error checking LangSmith config for ADK instrumentation: {e}"
                )

        # Initialize Session Service
        await self._initialize_session_service()

        # Initialize Memory Service
        await self._initialize_memory_service()

        # Load the agent instance
        agent = self._load_agent(self._configuration.agent)

        self._agent_instance = App(root_agent=agent, name=self._name)

        # Initialize CopilotKit/AG-UI Agent Wrapper
        # TODO: Pass session and memory services when supported by AG-UI ADK adapter if needed
        # Pin user_id via extractor instead of letting ADK fall back to
        # f"thread_user_{thread_id}" (which makes listing impossible and
        # lets a thread_id alone resolve a session across users).
        self._copilotkit_agent_instance = ADKAGUIAgent(
            adk_agent=agent,
            session_service=self._session_service,
            memory_service=self._memory_service,
            app_name=self._name,
            user_id_extractor=lambda _input: current_user_id.get(),
        )

        self._infos["status"] = "Initialized"
        self._infos["config_used"] = self._configuration.model_dump()

    async def _initialize_session_service(self) -> None:
        """Initialize the session service based on configuration."""
        if not self._configuration:
            raise RuntimeError("Configuration not initialized")

        if not self._configuration.session_service:
            # Default to InMemory if not specified
            self._session_service = InMemorySessionService()
            return

        config = self._configuration.session_service
        if isinstance(config, AdkInMemorySessionConfig):
            self._session_service = InMemorySessionService()
        elif isinstance(config, AdkVertexAiSessionConfig):
            self._session_service = VertexAiSessionService(
                project=config.project_id,
                location=config.location,
                agent_engine_id=config.reasoning_engine_app_name,
            )
        elif isinstance(config, AdkDatabaseSessionConfig):
            self._session_service = DatabaseSessionService(db_url=config.db_url)
        else:
            raise ValueError(f"Unsupported session service type: {config.type}")  # type: ignore

    async def _initialize_memory_service(self) -> None:
        """Initialize the memory service based on configuration."""
        if not self._configuration:
            raise RuntimeError("Configuration not initialized")

        if not self._configuration.memory_service:
            # Default to InMemory if not specified
            self._memory_service = InMemoryMemoryService()
            return

        config = self._configuration.memory_service
        if isinstance(config, AdkInMemoryMemoryConfig):
            self._memory_service = InMemoryMemoryService()
        elif isinstance(config, AdkVertexAiMemoryConfig):
            self._memory_service = VertexAiMemoryBankService(
                project=config.project_id,
                location=config.location,
                agent_engine_id=config.memory_bank_id,
            )
        else:
            raise ValueError(f"Unsupported memory service type: {config.type}")  # type: ignore

    def _load_agent(self, agent_definition: str) -> Any:
        """Loads an agent instance from a specified path."""
        try:
            module_path, agent_variable_name = agent_definition.rsplit(":", 1)
        except ValueError:
            raise ValueError(
                "agent_definition must be in the format 'path/to/file.py:variable_name'"
            ) from None

        try:
            from pathlib import Path

            resolved_path = Path(module_path).resolve()
            spec = importlib.util.spec_from_file_location(
                agent_variable_name, str(resolved_path)
            )
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load spec for module at {module_path}")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            agent_instance = getattr(module, agent_variable_name)
            return agent_instance
        except (FileNotFoundError, ImportError, AttributeError) as e:
            raise ValueError(
                f"Failed to load agent from {agent_definition}: {e}"
            ) from e

    def _get_text_from_message(self, message: Any) -> str:
        if isinstance(message, BaseModel):
            return message.model_dump_json()
        if isinstance(message, dict) and "query" in message:
            return message["query"]
        raise ValueError(f"Unsupported message type: {type(message)}")

    def _get_session_id_from_message(self, message: Any) -> str:
        if isinstance(message, BaseModel):
            return "structured"
        if isinstance(message, dict) and "session_id" in message:
            return message["session_id"]
        return "default"

    def _create_runner(self) -> Runner:
        return Runner(
            app=self._agent_instance,
            session_service=self._session_service,
            memory_service=self._memory_service,
        )

    def _extract_text_from_event(self, event: Event) -> str | None:
        if not event.content or not event.content.parts:
            return None
        for part in event.content.parts:
            if part.text:
                return part.text
        return None

    async def _get_or_create_session(self, user_id: str, session_id: str) -> None:
        session = await self._session_service.get_session(
            app_name=self._name, user_id=user_id, session_id=session_id
        )
        if not session:
            await self._session_service.create_session(
                app_name=self._name, user_id=user_id, session_id=session_id
            )

    async def invoke(self, message: Any) -> Any:
        if self._agent_instance is None:
            raise RuntimeError(
                "Agent not initialized. Call initialize() before processing messages."
            )

        try:
            text = self._get_text_from_message(message)
            session_id = self._get_session_id_from_message(message)
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Failed to parse message: {e}") from e

        user_id = f"user-{session_id}"
        content = types.Content(parts=[types.Part(text=text)], role="user")

        try:
            await self._get_or_create_session(user_id, session_id)
        except Exception as e:
            raise RuntimeError(f"Failed to create session: {e}") from e

        try:
            runner = self._create_runner()
        except Exception as e:
            raise RuntimeError(f"Failed to create runner: {e}") from e

        final_text = ""
        try:
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=content,
            ):
                extracted = self._extract_text_from_event(event)
                if extracted:
                    final_text = extracted
        except Exception as e:
            raise RuntimeError(f"Failed to run agent: {e}") from e

        return final_text

    async def stream(self, message: Any) -> AsyncGenerator[Any]:
        """Process a single input message and return an asynchronous stream."""
        if self._agent_instance is None:
            raise RuntimeError(
                "Agent not initialized. Call initialize() before processing messages."
            )

        # TODO: Implement ADK stream logic using session and memory services
        raise NotImplementedError("ADK stream not implemented yet")

        # Required to make this a generator
        if False:
            yield

    def discover_capabilities(self) -> AgentCapabilities:
        """Introspect the ADK agent for input/output schemas."""
        if self._cached_capabilities is not None:
            return self._cached_capabilities

        from idun_agent_schema.engine.agent_framework import AgentFramework
        from idun_agent_schema.engine.capabilities import (
            AgentCapabilities,
            CapabilityFlags,
            InputDescriptor,
            OutputDescriptor,
        )

        # ADK agent instance is wrapped inside an App; the raw agent
        # was passed to ADKAGUIAgent. Try to access schema from the
        # underlying agent object stored on the App.
        agent = getattr(self._agent_instance, "root_agent", None)

        input_schema = getattr(agent, "input_schema", None) if agent else None
        output_schema = getattr(agent, "output_schema", None) if agent else None

        input_mode: str = "chat"
        input_json_schema = None
        if input_schema is not None:
            input_mode = "structured"
            if hasattr(input_schema, "model_json_schema"):
                input_json_schema = input_schema.model_json_schema()

        output_mode: str = "text"
        output_json_schema = None
        if output_schema is not None:
            output_mode = "structured"
            if hasattr(output_schema, "model_json_schema"):
                output_json_schema = output_schema.model_json_schema()

        has_session = self._session_service is not None

        result = AgentCapabilities(
            version="1",
            framework=AgentFramework.ADK,
            capabilities=CapabilityFlags(
                streaming=True,
                history=has_session,
                thread_id=has_session,
            ),
            input=InputDescriptor(mode=input_mode, schema_=input_json_schema),
            output=OutputDescriptor(mode=output_mode, schema_=output_json_schema),
            history=self.history_capabilities(),
        )
        self._cached_capabilities = result
        return result

    def get_graph_ir(self):
        from google.adk.agents import (
            LlmAgent,
            LoopAgent,
            ParallelAgent,
            SequentialAgent,
        )
        from idun_agent_schema.engine.agent_framework import AgentFramework
        from idun_agent_schema.engine.graph import (
            AgentGraph,
            AgentGraphEdge,
            AgentGraphMetadata,
            AgentGraphNode,
            AgentKind,
            AgentNode,
            EdgeKind,
            ToolKind,
            ToolNode,
        )

        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() first.")

        root_agent = self._agent_instance.root_agent
        nodes: list[AgentGraphNode] = []
        edges: list[AgentGraphEdge] = []
        warnings: list[str] = []

        def _agent_kind(a: object) -> AgentKind:
            if isinstance(a, SequentialAgent):
                return AgentKind.SEQUENTIAL
            if isinstance(a, ParallelAgent):
                return AgentKind.PARALLEL
            if isinstance(a, LoopAgent):
                return AgentKind.LOOP
            if isinstance(a, LlmAgent):
                return AgentKind.LLM
            return AgentKind.CUSTOM

        def _classify_tool(tool: object) -> tuple[ToolKind, str | None]:
            # Try MCP toolset detection — both old and new import paths.
            for mod_path in (
                "google.adk.tools.mcp_tool.mcp_toolset",
                "google.adk.tools",
            ):
                try:
                    module = __import__(mod_path, fromlist=["MCPToolset", "McpToolset"])
                    cls = getattr(module, "MCPToolset", None) or getattr(
                        module, "McpToolset", None
                    )
                    if cls is not None and isinstance(tool, cls):
                        return (
                            ToolKind.MCP,
                            _describe_mcp_params(
                                getattr(tool, "connection_params", None)
                            ),
                        )
                except Exception:
                    continue
            # Built-in detection: anything in google.adk.tools.* not matched as MCP.
            # User functions live in their own module.
            module_name = getattr(tool, "__module__", "") or ""
            if module_name.startswith("google.adk.tools"):
                return (ToolKind.BUILT_IN, None)
            return (ToolKind.NATIVE, None)

        def _walk(agent: object, is_root: bool = False) -> str:
            agent_id = f"agent:{agent.name}"
            kind = _agent_kind(agent)
            nodes.append(
                AgentNode(
                    id=agent_id,
                    name=agent.name,
                    agent_kind=kind,
                    is_root=is_root,
                    description=getattr(agent, "description", None),
                    model=(
                        getattr(agent, "model", None) if kind == AgentKind.LLM else None
                    ),
                    loop_max_iterations=(
                        getattr(agent, "max_iterations", None)
                        if kind == AgentKind.LOOP
                        else None
                    ),
                )
            )
            if kind == AgentKind.CUSTOM:
                warnings.append(
                    f"Agent '{agent.name}' is a custom BaseAgent subclass; "
                    f"introspected best-effort"
                )

            for tool in getattr(agent, "tools", None) or []:
                tool_name = (
                    getattr(tool, "name", None)
                    or getattr(tool, "__name__", None)
                    or repr(tool)[:40]
                )
                tool_id = f"tool:{tool_name}@{agent.name}"
                tool_kind, server_desc = _classify_tool(tool)
                nodes.append(
                    ToolNode(
                        id=tool_id,
                        name=tool_name,
                        tool_kind=tool_kind,
                        description=getattr(tool, "description", None),
                        mcp_server_name=server_desc,
                    )
                )
                edges.append(
                    AgentGraphEdge(
                        source=agent_id, target=tool_id, kind=EdgeKind.TOOL_ATTACH
                    )
                )

            # Sub-agents — Task 7 will add edge-kind dispatch.
            # For Task 6 we use PARENT_CHILD for all sub-agent edges.
            for sub in getattr(agent, "sub_agents", None) or []:
                child_id = _walk(sub, is_root=False)
                edges.append(
                    AgentGraphEdge(
                        source=agent_id, target=child_id, kind=EdgeKind.PARENT_CHILD
                    )
                )
            return agent_id

        root_id = _walk(root_agent, is_root=True)
        return AgentGraph(
            metadata=AgentGraphMetadata(
                framework=AgentFramework.ADK,
                agent_name=self.name,
                root_id=root_id,
                warnings=warnings,
            ),
            nodes=nodes,
            edges=edges,
        )

    def history_capabilities(self) -> HistoryCapabilities:
        """Declare ADK session-history support.

        Both list and get are supported when an ADK ``session_service``
        is wired (it always is for ADK adapters — defaults to
        ``InMemorySessionService``).
        """
        return HistoryCapabilities(
            can_list=self._session_service is not None,
            can_get=self._session_service is not None,
        )

    async def list_sessions(
        self, *, user_id: str | None = None
    ) -> list[SessionSummary]:
        """List ADK sessions for ``user_id``, newest first.

        ADK's ``list_sessions`` returns lightweight rows without events,
        so we re-fetch each full session to compute the preview from the
        first user-authored text event.
        """
        if not self._session_service:
            return []
        scope_user = user_id or current_user_id.get()
        res = await self._session_service.list_sessions(
            app_name=self._name,
            user_id=scope_user,
        )
        raw_sessions = list(getattr(res, "sessions", []) or [])
        raw_sessions.sort(
            key=lambda s: getattr(s, "last_update_time", 0) or 0,
            reverse=True,
        )

        out: list[SessionSummary] = []
        for s in raw_sessions:
            full = await self._session_service.get_session(
                app_name=self._name,
                user_id=getattr(s, "user_id", scope_user),
                session_id=s.id,
            )
            if full is None:
                continue
            state = getattr(full, "state", None)
            thread_id_value = (
                state.get("_ag_ui_thread_id") if isinstance(state, dict) else None
            )
            if not isinstance(thread_id_value, str):
                continue
            out.append(
                SessionSummary(
                    id=thread_id_value,
                    last_update_time=getattr(s, "last_update_time", None),
                    user_id=getattr(s, "user_id", scope_user),
                    thread_id=thread_id_value,
                    preview=_first_user_text(full),
                )
            )
        return out

    async def get_session(
        self, session_id: str, *, user_id: str | None = None
    ) -> SessionDetail | None:
        """Reconstruct a single ADK session as a text-only message thread.

        ``session_id`` is the AG-UI thread_id (what the UI routes by).
        ADK's own session_id is auto-generated and stored separately;
        we resolve thread_id to it via the ``_ag_ui_thread_id`` key in
        session state.
        """
        if not self._session_service:
            return None
        scope_user = user_id or current_user_id.get()
        listing = await self._session_service.list_sessions(
            app_name=self._name,
            user_id=scope_user,
        )
        match = next(
            (
                row
                for row in getattr(listing, "sessions", []) or []
                if isinstance(getattr(row, "state", None), dict)
                and row.state.get("_ag_ui_thread_id") == session_id
            ),
            None,
        )
        if match is None:
            return None
        full = await self._session_service.get_session(
            app_name=self._name,
            user_id=getattr(match, "user_id", scope_user),
            session_id=match.id,
        )
        if full is None:
            return None
        return SessionDetail(
            id=session_id,
            last_update_time=getattr(full, "last_update_time", None),
            user_id=getattr(full, "user_id", None),
            thread_id=session_id,
            messages=_events_to_messages(getattr(full, "events", []) or []),
        )

    async def run(self, input_data: RunAgentInput) -> AsyncGenerator[BaseEvent, None]:
        """Canonical AG-UI interaction entry point.

        Delegates to ADKAGUIAgent for event generation. For structured
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

        copilotkit_agent = self.copilotkit_agent_instance
        async for event in copilotkit_agent.run(input_data):
            yield event
