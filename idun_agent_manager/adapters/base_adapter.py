from abc import ABC, abstractmethod
from typing import Any, List, Dict, Tuple

class IAgentAdapter(ABC):
    """
    Interface for agent framework adapters.
    Each adapter for a specific agent framework (e.g., LangGraph, Autogen)
    should implement this interface.
    """

    @abstractmethod
    def initialize_agent(self, config: Dict[str, Any]) -> Any:
        """
        Initializes an agent instance based on the provided configuration.

        Args:
            config: The agent-specific configuration dictionary.

        Returns:
            An instance of the initialized agent (framework-specific).
        """
        pass

    @abstractmethod
    def process_message(
        self,
        agent_instance: Any,
        messages: List[Dict[str, Any]],
        session_state: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Processes a list of messages using the agent instance and returns the response.

        Args:
            agent_instance: The initialized agent instance.
            messages: A list of messages to send to the agent. 
                      Each message is a dictionary, e.g., {"role": "user", "content": "Hello"}.
            session_state: The current state of the session, to be passed to the agent if needed.

        Returns:
            A tuple containing:
            - The agent's response (framework-specific, typically a dictionary).
            - The updated session state (framework-specific, typically a dictionary).
        """
        pass 