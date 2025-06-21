import unittest
import os
import asyncio
from idun_agent_manager.core.agents.langgraph_agent_impl import LanggraphAgent

class TestLanggraphAgentCreation(unittest.TestCase):

    def setUp(self):
        """Set up a dummy database file for the test."""
        self.db_path = "test_checkpoint.db"
        # Ensure the file does not exist before the test
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def tearDown(self):
        """Clean up the dummy database file after the test."""
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_create_and_initialize_langgraph_agent(self):
        """
        Tests the creation and initialization of a LanggraphAgent.
        """
        agent_config = {
            "name": "Test Simple Agent",
            "agent_path": "tests/example_agents/simple_graph.py:simple_test_graph",
            "checkpoint": {
                "type": "sqlite",
                "db_path": self.db_path
            }
        }

        # Directly instantiate and initialize the agent
        try:
            agent = LanggraphAgent(initial_config=agent_config)
            
            # The __init__ method calls initialize, so we can check the state now.
            self.assertIsNotNone(agent.agent_instance, "Agent instance should be compiled.")
            self.assertEqual(agent.name, "Test Simple Agent")
            
            # Check if the agent's info reflects the configuration
            infos = agent.infos
            self.assertEqual(infos.get("status"), "Initialized")
            self.assertEqual(infos.get("name"), "Test Simple Agent")
            self.assertIn("checkpoint", infos)
            self.assertEqual(infos["checkpoint"]["type"], "sqlite")
            
            print("\nLanggraphAgent created and initialized successfully.")
            print(f"Agent Name: {agent.name}")
            print(f"Agent Info: {agent.infos}")
            
        except Exception as e:
            self.fail(f"Agent creation failed with an exception: {e}")

    def test_chat_with_agent(self):
        """Tests chatting with an initialized LanggraphAgent."""
        agent_config = {
            "name": "Test Echo Agent",
            "agent_path": "tests/example_agents/simple_graph.py:simple_test_graph",
            "checkpoint": {
                "type": "sqlite",
                "db_path": self.db_path
            }
        }
        agent = LanggraphAgent(initial_config=agent_config)

        async def run_chat():
            # Chat with the agent
            session_id = "test-session-123"
            chat_message = {"query": "Hello, world!", "session_id": session_id}
            
            response = await agent.process_message(chat_message)

            self.assertIn("You said: Hello, world!", response)
            print(f"\nChat test successful. Agent response: {response}")

            # Test conversation memory
            chat_message_2 = {"query": "How are you?", "session_id": session_id}
            response_2 = await agent.process_message(chat_message_2)
            self.assertIn("You said: How are you?", response_2)
            print(f"Second chat in session successful. Agent response: {response_2}")

        # Run the async test function
        asyncio.run(run_chat())

if __name__ == '__main__':
    unittest.main() 