from typing import Any, Dict, Optional, AsyncGenerator, Union
import uuid
import asyncio
import json
from idun_agent_manager.core.iagent import IAgent
from idun_agent_manager.ag_ui.core.events import (
    RunStartedEvent, RunFinishedEvent, TextMessageStartEvent,
    TextMessageContentEvent, TextMessageEndEvent, EventType,
    ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent, ThinkingStartEvent, ThinkingEndEvent,
    StepStartedEvent, StepFinishedEvent
)
from idun_agent_manager.ag_ui.core.types import UserMessage

class ADKAgent(IAgent):
    """Implementation for an ADK (Agent Development Kit) agent.
    This class wraps an ADK agent and adapts it to the IAgent interface.
    """

    def __init__(self, initial_config: Optional[Dict[str, Any]] = None):
        self._id = str(uuid.uuid4())
        self._agent_type = "ADK"
        self._input_schema: Any = None
        self._output_schema: Any = None
        self._agent_instance: Any = None  # This will hold the ADK Agent
        self._runner: Any = None  # This will hold the ADK Runner
        self._configuration: Dict[str, Any] = initial_config or {}
        self._name: str = self._configuration.get("name", "Unnamed ADK Agent")
        self._infos: Dict[str, Any] = {"status": "Uninitialized", "name": self._name, "id": self._id}
        self._a2a_card: Optional[Dict[str, Any]] = None
        self._a2a_server_details: Optional[Dict[str, Any]] = None
        if initial_config:
            asyncio.run(self.initialize(initial_config))

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
        self._infos["underlying_agent_type"] = str(type(self._agent_instance)) if self._agent_instance else "N/A"
        return self._infos

    @property
    def a2a_card(self) -> Optional[Dict[str, Any]]:
        return self._a2a_card

    @property
    def a2a_server_details(self) -> Optional[Dict[str, Any]]:
        return self._a2a_server_details

    async def initialize(self, config: Dict[str, Any]) -> None:
        """Initializes the ADK agent with the given configuration."""
        try:
            # Import ADK modules
            from google.adk.agents import Agent
            from google.adk.core.runner import Runner
            from google.adk.sessions import InMemorySessionService
            
            self._configuration = config
            self._name = config.get("name", "Unnamed ADK Agent")
            self._infos["name"] = self._name

            # Get agent configuration
            model = config.get("model", "gemini-2.0-flash")
            description = config.get("description", "An ADK agent")
            instruction = config.get("instruction", "You are a helpful assistant.")
            tools = config.get("tools", [])

            # Load tools if specified as strings (module paths)
            loaded_tools = []
            for tool in tools:
                if isinstance(tool, str):
                    # Tool is specified as a module path like "path.to.module:function_name"
                    loaded_tool = self._load_tool(tool)
                    loaded_tools.append(loaded_tool)
                else:
                    # Tool is already a function object
                    loaded_tools.append(tool)

            # Create the ADK Agent
            self._agent_instance = Agent(
                model=model,
                name=self._name,
                description=description,
                instruction=instruction,
                tools=loaded_tools
            )

            # Create a Runner for the agent
            session_service = InMemorySessionService()
            self._runner = Runner(agent=self._agent_instance, session_service=session_service)

            # Set up schemas if available
            self._input_schema = config.get("input_schema_definition", Any)
            self._output_schema = config.get("output_schema_definition", Any)

            self._infos["status"] = "Initialized"
            self._infos["config_used"] = config
            self._infos["model"] = model
            self._infos["tools_count"] = len(loaded_tools)

        except ImportError as e:
            raise RuntimeError(f"Failed to import ADK modules. Make sure google-adk is installed: {e}")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize ADK agent: {e}")

    def _load_tool(self, tool_path: str) -> Any:
        """Loads a tool function from a module path."""
        try:
            import importlib.util
            
            module_path, function_name = tool_path.rsplit(":", 1)
            
            spec = importlib.util.spec_from_file_location("tool_module", module_path)
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load spec for module at {module_path}")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            tool_function = getattr(module, function_name)
            return tool_function
        except Exception as e:
            raise ValueError(f"Failed to load tool from {tool_path}: {e}")

    async def process_message(self, message: Any) -> Any:
        """Processes a single input message and returns a response."""
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() before processing messages.")

        if not isinstance(message, dict) or "query" not in message or "session_id" not in message:
            raise ValueError("Message must be a dictionary with 'query' and 'session_id' keys.")

        try:
            # Use the runner to process the message
            session_id = message["session_id"]
            query = message["query"]
            
            # Get or create session
            session = self._runner.get_or_create_session(user_id="user", session_id=session_id)
            
            # Run the agent and collect all events
            events = []
            async for event in self._runner.run_async(session_id=session_id, message=query):
                events.append(event)
            
            # Return the last text response from the agent
            for event in reversed(events):
                if (hasattr(event, 'author') and event.author == self._name and 
                    hasattr(event, 'content') and event.content and 
                    hasattr(event.content, 'parts') and event.content.parts):
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            return part.text
            
            return "No response generated"
            
        except Exception as e:
            raise RuntimeError(f"Failed to process message: {e}")

    async def process_message_stream(self, message: Any) -> AsyncGenerator[Any, None]:
        """Processes a single input message and returns a stream of ag-ui events."""
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() before processing messages.")

        if isinstance(message, dict) and "query" in message and "session_id" in message:
            run_id = f"run_{uuid.uuid4()}"
            thread_id = message["session_id"]
            user_message = UserMessage(id=f"msg_{uuid.uuid4()}", role="user", content=message["query"])
            query = message["query"]
        else:
            raise ValueError("Unsupported message format for process_message_stream. Expects {'query': str, 'session_id': str}")

        current_message_id = None
        current_tool_call_id = None
        current_step_name = None
        in_thinking = False

        try:
            # Start the run
            yield RunStartedEvent(type=EventType.RUN_STARTED, run_id=run_id, thread_id=thread_id)

            # Use the runner to process the message and stream events
            async for adk_event in self._runner.run_async(session_id=thread_id, message=query):
                
                # Convert ADK events to ag-ui events
                if hasattr(adk_event, 'author') and hasattr(adk_event, 'content'):
                    author = adk_event.author
                    content = adk_event.content if adk_event.content else {}
                    
                    # Handle different types of ADK events
                    if author == "user":
                        # User input event - usually skip in streaming
                        continue
                    
                    elif author == self._name:
                        # Agent response
                        if hasattr(content, 'parts') and content.parts:
                            for part in content.parts:
                                # Handle text content
                                if hasattr(part, 'text') and part.text:
                                    if not current_message_id:
                                        current_message_id = f"msg_{uuid.uuid4()}"
                                        yield TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, 
                                                                   message_id=current_message_id, role="assistant")
                                    
                                    yield TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, 
                                                                message_id=current_message_id, delta=part.text)
                                
                                # Handle function calls
                                elif hasattr(part, 'function_call') and part.function_call:
                                    func_call = part.function_call
                                    tool_call_id = getattr(func_call, 'id', f"tool_{uuid.uuid4()}")
                                    tool_name = getattr(func_call, 'name', 'unknown_tool')
                                    
                                    # Start thinking
                                    if not in_thinking:
                                        yield ThinkingStartEvent(type=EventType.THINKING_START, title=f"Using {tool_name}...")
                                        in_thinking = True
                                    
                                    # Start tool call
                                    current_tool_call_id = tool_call_id
                                    if not current_message_id:
                                        current_message_id = f"msg_{uuid.uuid4()}"
                                        yield TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, 
                                                                   message_id=current_message_id, role="assistant")
                                    
                                    yield ToolCallStartEvent(type=EventType.TOOL_CALL_START, 
                                                           tool_call_id=current_tool_call_id, 
                                                           tool_call_name=tool_name,
                                                           parent_message_id=current_message_id)
                                    
                                    # Add tool arguments
                                    if hasattr(func_call, 'args') and func_call.args:
                                        args_str = json.dumps(func_call.args) if isinstance(func_call.args, dict) else str(func_call.args)
                                        yield ToolCallArgsEvent(type=EventType.TOOL_CALL_ARGS, 
                                                              tool_call_id=current_tool_call_id, 
                                                              delta=args_str)
                                    
                                    # End tool call
                                    yield ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=current_tool_call_id)
                                    current_tool_call_id = None
                                
                                # Handle function responses
                                elif hasattr(part, 'function_response') and part.function_response:
                                    if in_thinking:
                                        yield ThinkingEndEvent(type=EventType.THINKING_END)
                                        in_thinking = False
                    
                    # Check if this is a final response (simple heuristic)
                    if (hasattr(adk_event, 'actions') and adk_event.actions and 
                        hasattr(adk_event.actions, 'turn_complete') and adk_event.actions.turn_complete):
                        # This appears to be the end of the turn
                        break

            # End thinking if still active
            if in_thinking:
                yield ThinkingEndEvent(type=EventType.THINKING_END)

            # End current message if active
            if current_message_id:
                yield TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=current_message_id)

            # End the run
            yield RunFinishedEvent(type=EventType.RUN_FINISHED, run_id=run_id, thread_id=thread_id)

        except Exception as e:
            # Ensure we clean up in case of error
            if in_thinking:
                yield ThinkingEndEvent(type=EventType.THINKING_END)
            if current_message_id:
                yield TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=current_message_id)
            yield RunFinishedEvent(type=EventType.RUN_FINISHED, run_id=run_id, thread_id=thread_id)
            raise RuntimeError(f"Error during streaming: {e}")

    def get_session(self, session_id: Optional[str] = None) -> Any:
        """Retrieves or establishes a session for the agent."""
        if self._runner is None:
            raise RuntimeError("Agent not initialized. Call initialize() first.")
        
        try:
            session_id = session_id or str(uuid.uuid4())
            return self._runner.get_or_create_session(user_id="user", session_id=session_id)
        except Exception as e:
            raise RuntimeError(f"Failed to get session: {e}")

    def get_memory(self, session_id: Optional[str] = None) -> Any:
        """Accesses the agent's memory, optionally for a specific session."""
        if self._runner is None:
            raise RuntimeError("Agent not initialized. Call initialize() first.")
        
        try:
            session = self.get_session(session_id)
            return session.state if hasattr(session, 'state') else {}
        except Exception as e:
            raise RuntimeError(f"Failed to get memory: {e}")

    def set_observability(self, observability_provider: Any) -> None:
        """Configures observability (logging, tracing, metrics)."""
        print(f"ADKAgent: Setting observability provider: {observability_provider}")
        self._infos["observability_provider"] = str(observability_provider)

    def get_infos(self) -> Dict[str, Any]:
        """Returns information about the agent instance."""
        return self.infos

    def get_workflow(self) -> Any:
        """Returns the definition or representation of the agent's workflow."""
        print("ADKAgent: Getting workflow.")
        if self._agent_instance:
            return {
                "agent_name": self._name,
                "model": self._configuration.get("model"),
                "tools": [str(tool) for tool in self._configuration.get("tools", [])],
                "description": self._configuration.get("description"),
                "instruction": self._configuration.get("instruction")
            }
        raise NotImplementedError("ADKAgent.get_workflow not available when agent not initialized.")

    def set_a2a_server(self, server_info: Dict[str, Any]) -> None:
        """Configures the agent-to-agent communication server."""
        print(f"ADKAgent: Setting A2A server info: {server_info}")
        self._a2a_server_details = server_info
        self._infos["a2a_server_configured"] = True 