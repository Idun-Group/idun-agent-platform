import os
import sys
import asyncio

# Add the project root to the Python path to allow for absolute imports
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from idun_agent_manager.core.agents.langgraph_agent_impl import LanggraphAgent


async def main():
    """
    This function loads the simple echo agent and chats with it.
    """
    db_path = "checkpoint_async.db"
    # Clean up previous db file if it exists
    if os.path.exists(db_path):
        os.remove(db_path)

    agent = None
    try:
        # This dictionary defines how to load and configure the agent.
        agent_config = {
            "name": "My Async Echo Agent",
            "agent_path": "tests/example_agents/simple_graph.py:simple_test_graph",
            "checkpoint": {
                "type": "sqlite",
                "db_path": db_path
            }
        }

        print("Creating and initializing agent asynchronously...")
        # 1. Create instance
        agent = LanggraphAgent()
        # 2. Initialize it
        await agent.initialize(agent_config)

        print("Agent loaded successfully.")
        print(f"Agent Name: {agent.name}")
        print(f"Agent ID: {agent.id}")
        print(f"Agent Info: {agent.infos}")
        print("-" * 30)

        session_id = "my-async-chat-session-1"
        
        # First interaction
        query1 = "Hello, this is my first async message."
        print(f"User (session: {session_id}): {query1}")
        chat_message1 = {"query": query1, "session_id": session_id}
        response1 = await agent.process_message(chat_message1)
        print(f"Agent: {response1}")
        print("-" * 30)

        # Second interaction in the same session to test memory.
        query2 = "This is the second async message."
        print(f"User (session: {session_id}): {query2}")
        chat_message2 = {"query": query2, "session_id": session_id}
        response2 = await agent.process_message(chat_message2)
        print(f"Agent: {response2}")
        print("-" * 30)

    finally:
        if agent:
            # 3. Close the connection
            await agent.close()
        
        # 4. Now it's safe to clean up the db file
        if os.path.exists(db_path):
            os.remove(db_path)
            print(f"Cleaned up '{db_path}'.")


if __name__ == "__main__":
    asyncio.run(main())
