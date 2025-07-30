from typing import Any, Dict, Optional, AsyncGenerator
import uuid
import asyncio
import json
from idun_agent_manager.core.iagent import IAgent
from ag_ui.core.events import (
    RunStartedEvent, RunFinishedEvent, TextMessageStartEvent,
    TextMessageContentEvent, TextMessageEndEvent, EventType,
    ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent, ThinkingStartEvent, ThinkingEndEvent,
    StepStartedEvent, StepFinishedEvent
)
from ag_ui.core.types import UserMessage

class SmolAgent(IAgent):
    """
    Implementation for a smolagents agent.
    This class wraps a smolagents CodeAgent and adapts it to the IAgent interface.
    """

    def __init__(self, initial_config: Optional[Dict[str, Any]] = None):
        self._id = str(uuid.uuid4())
        self._agent_type = "Smol"
        self._input_schema: Any = None
        self._output_schema: Any = None
        self._agent_instance: Any = None  # This will hold the Smol CodeAgent
        self._configuration: Dict[str, Any] = initial_config or {}
        self._name: str = self._configuration.get("name", "Unnamed SmolAgent")
        self._infos: Dict[str, Any] = {"status": "Uninitialized", "name": self._name, "id": self._id}
        self._a2a_card: Optional[Dict[str, Any]] = None
        self._a2a_server_details: Optional[Dict[str, Any]] = None

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
        """Initializes the SmolAgent with the given configuration."""
        self._configuration = config
        self._name = config.get("name", "Unnamed SmolAgent")
        self._infos["name"] = self._name

        try:
            from smolagents import CodeAgent
            from smolagents.tools import WebSearchTool
            
            # --- Model Configuration ---
            model_config = config.get("model_config", {})
            model_type = model_config.pop("type", "InferenceClientModel")
            
            model = None
            if model_type == "InferenceClientModel":
                from smolagents.models import InferenceClientModel
                model = InferenceClientModel(**model_config)
            elif model_type == "LiteLLMModel":
                from smolagents.models import LiteLLMModel
                model = LiteLLMModel(**model_config)
            elif model_type == "OpenAIServerModel":
                from smolagents.models import OpenAIServerModel
                model = OpenAIServerModel(**model_config)
            elif model_type == "AzureOpenAIServerModel":
                from smolagents.models import AzureOpenAIServerModel
                model = AzureOpenAIServerModel(**model_config)
            elif model_type == "AmazonBedrockServerModel":
                from smolagents.models import AmazonBedrockServerModel
                model = AmazonBedrockServerModel(**model_config)
            elif model_type == "TransformersModel":
                from smolagents.models import TransformersModel
                model = TransformersModel(**model_config)
            else:
                raise ValueError(f"Unsupported smolagents model type: {model_type}")

            # --- Tool Configuration ---
            tools_config = config.get("tools_config", [])
            loaded_tools = []
            for tool_name in tools_config:
                if tool_name == "WebSearchTool":
                    loaded_tools.append(WebSearchTool())
                # Add other pre-built tools here if needed
                else:
                    print(f"Warning: Tool '{tool_name}' not recognized. Skipping.")

            # --- Agent Instantiation ---
            self._agent_instance = CodeAgent(
                model=model,
                tools=loaded_tools,
                stream_outputs=True
            )

            self._input_schema = {"query": str, "session_id": str}
            self._output_schema = Any
            self._infos["status"] = "Initialized"
            self._infos["config_used"] = config
            self._infos["model_type"] = model_type

        except ImportError as e:
            raise RuntimeError(f"Failed to import smolagents modules. Make sure 'smolagents' is installed: {e}")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize SmolAgent: {e}")

    async def process_message(self, message: Any) -> Any:
        """Processes a single input message and returns a final response."""
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() before processing messages.")

        if not isinstance(message, dict) or "query" not in message:
            raise ValueError("Message must be a dictionary with a 'query' key.")

        query = message["query"]

        def run_agent_sync():
            final_answer = f"No answer found for: {query}"
            for event in self._agent_instance.run(query):
                if event.get("type") == "answer":
                    final_answer = event.get("data")
            return final_answer

        try:
            # Run the synchronous agent code in a separate thread
            final_answer = await asyncio.to_thread(run_agent_sync)
            return final_answer
        except Exception as e:
            raise RuntimeError(f"Error processing message with SmolAgent: {e}")

    async def process_message_stream(self, message: Any) -> AsyncGenerator[Any, None]:
        """Processes a single input message and returns a stream of ag-ui events."""
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() before processing messages.")

        if not isinstance(message, dict) or "query" not in message or "session_id" not in message:
            raise ValueError("Unsupported message format. Expects {'query': str, 'session_id': str}")

        run_id = f"run_{uuid.uuid4()}"
        thread_id = message["session_id"]
        query = message["query"]

        yield RunStartedEvent(type=EventType.RUN_STARTED, run_id=run_id, thread_id=thread_id)
        
        current_message_id = None
        current_tool_call_id = None
        
        try:
            # Since agent.run is synchronous, we run it in a thread
            def run_and_yield():
                # This function will be executed in a separate thread
                # It yields results which we will process in the async generator
                yield from self._agent_instance.run(query)

            loop = asyncio.get_running_loop()
            # We need a way to get the sync generator's items into our async context
            # We'll use a queue and a separate thread to populate it.
            queue = asyncio.Queue()
            
            def producer():
                for item in self._agent_instance.run(query):
                    # This is thread-safe
                    loop.call_soon_threadsafe(queue.put_nowait, item)
                loop.call_soon_threadsafe(queue.put_nowait, None) # Sentinel to signal the end

            producer_task = loop.run_in_executor(None, producer)

            while True:
                event = await queue.get()
                if event is None: # End of stream
                    break

                event_type = event.get("type")
                data = event.get("data")

                if event_type == "thought":
                    yield ThinkingStartEvent(type=EventType.THINKING_START, title=data)
                    yield ThinkingEndEvent(type=EventType.THINKING_END)

                elif event_type == "tool_code":
                    if not current_message_id:
                        current_message_id = f"msg_{uuid.uuid4()}"
                        yield TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=current_message_id, role="assistant")

                    current_tool_call_id = f"tool_{uuid.uuid4()}"
                    yield ToolCallStartEvent(
                        type=EventType.TOOL_CALL_START,
                        tool_call_id=current_tool_call_id,
                        tool_call_name="code_interpreter",
                        parent_message_id=current_message_id
                    )
                    yield ToolCallArgsEvent(
                        type=EventType.TOOL_CALL_ARGS,
                        tool_call_id=current_tool_call_id,
                        delta=data
                    )

                elif event_type == "tool_output":
                    if current_tool_call_id:
                        yield ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=current_tool_call_id)
                        # We could yield the tool output as a text message if desired
                        yield TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, message_id=current_message_id, delta=f"\nTool output:\n```\n{data}\n```")
                        current_tool_call_id = None

                elif event_type == "answer":
                    if not current_message_id:
                        current_message_id = f"msg_{uuid.uuid4()}"
                        yield TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=current_message_id, role="assistant")
                    
                    yield TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, message_id=current_message_id, delta=data)
            
            await producer_task # ensure thread is finished

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, message_id=current_message_id or f"msg_{uuid.uuid4()}", delta=f"An error occurred: {e}")
        
        finally:
            if current_tool_call_id:
                yield ToolCallEndEvent(type=EventType.TOOL_CALL_END, tool_call_id=current_tool_call_id)
            if current_message_id:
                yield TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=current_message_id)
            
            yield RunFinishedEvent(type=EventType.RUN_FINISHED, run_id=run_id, thread_id=thread_id)

    def get_session(self, session_id: Optional[str] = None) -> Any:
        """smolagents manages session state internally per run, so this is a no-op."""
        print("SmolAgent: Session management is handled internally during each 'run'.")
        return {"session_id": session_id, "note": "State is not persisted between runs in this implementation."}

    def get_memory(self, session_id: Optional[str] = None) -> Any:
        """smolagents memory is part of the agent instance and is cleared per run."""
        return self._agent_instance.memory if hasattr(self._agent_instance, "memory") else None

    def set_observability(self, observability_provider: Any) -> None:
        """Configures observability (logging, tracing, metrics)."""
        print(f"SmolAgent: Setting observability provider: {observability_provider}")
        self._infos["observability_provider"] = str(observability_provider)

    def get_infos(self) -> Dict[str, Any]:
        """Returns information about the agent instance."""
        return self.infos

    def get_workflow(self) -> Any:
        """Returns the definition or representation of the agent's workflow."""
        if self._agent_instance:
            return {
                "agent_name": self.name,
                "model_config": self._configuration.get("model_config"),
                "tools_config": self._configuration.get("tools_config"),
            }
        raise NotImplementedError("SmolAgent.get_workflow not available when agent not initialized.")

    def set_a2a_server(self, server_info: Dict[str, Any]) -> None:
        """Configures the agent-to-agent communication server."""
        print(f"SmolAgent: Setting A2A server info: {server_info}")
        self._a2a_server_details = server_info
        self._infos["a2a_server_configured"] = True 