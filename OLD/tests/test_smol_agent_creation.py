"""
Test script for SmolAgent creation and functionality.
"""

import asyncio
import sys
import os

# Add the project root to the path so we can import our modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from idun_agent_manager.core.agents.smol_agent_impl import SmolAgent
from tests.example_agents_smol.simple_smol_agent import AGENT_CONFIG


async def test_smol_agent_creation():
    """Test creating a SmolAgent and running basic operations."""
    print("Testing SmolAgent Creation...")

    if not os.environ.get("TAVILY_API_KEY"):
        print("⚠️  Skipping test: TAVILY_API_KEY environment variable not set.")
        return True  # Skip test but don't fail the suite

    try:
        agent = SmolAgent()
        print(f"✅ Agent created with ID: {agent.id}")

        print("Initializing agent...")
        await agent.initialize(AGENT_CONFIG)
        print(f"✅ Agent initialized: {agent.name}")
        print(f"   Agent type: {agent.agent_type}")
        print(f"   Status: {agent.infos['status']}")

        return True

    except Exception as e:
        print(f"❌ Error during testing: {e}")
        import traceback

        traceback.print_exc()
        return False


async def test_smol_agent_streaming():
    """Test the streaming functionality of the SmolAgent."""
    print("\n" + "=" * 50)
    print("Testing SmolAgent Streaming...")

    if not os.environ.get("TAVILY_API_KEY"):
        print("⚠️  Skipping test: TAVILY_API_KEY environment variable not set.")
        return True

    try:
        agent = SmolAgent()
        await agent.initialize(AGENT_CONFIG)

        print("\nTesting streaming with a web search query...")
        test_message = {
            "query": "Who won the last F1 world championship?",
            "session_id": "test_session_streaming_smol",
        }

        event_count = 0
        final_answer = ""
        async for event in agent.process_message_stream(test_message):
            event_count += 1
            print(f"📡 Event {event_count}: {event.type}")
            if hasattr(event, "delta") and event.delta:
                print(f"   Content: {event.delta[:100]}...")
                if event.type == EventType.TEXT_MESSAGE_CONTENT:
                    final_answer += event.delta

        print(f"✅ Streaming test completed with {event_count} events.")
        print(f"🏁 Final Answer: {final_answer}")
        assert event_count > 2
        assert "Verstappen" in final_answer
        return True

    except Exception as e:
        print(f"❌ Error during streaming test: {e}")
        import traceback

        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    print("🧪 Starting SmolAgent Tests")
    print("=" * 50)

    # Check if smolagents is available
    try:
        import smolagents

        print("✅ smolagents package is available")
    except ImportError:
        print(
            "❌ smolagents package not found. Please install it with: pip install smolagents"
        )
        print("   Skipping SmolAgent tests...")
        return

    tests = [
        ("Basic Agent Creation", test_smol_agent_creation()),
        ("Streaming Functionality", test_smol_agent_streaming()),
    ]

    results = []
    for test_name, test_coro in tests:
        print(f"\n🧪 Running: {test_name}")
        result = await test_coro
        results.append((test_name, result))

    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    passed = 0
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
        if result:
            passed += 1

    print(f"\nTests passed: {passed}/{len(results)}")

    if passed == len(results):
        print("🎉 All tests passed!")
    else:
        print("⚠️  Some tests failed. Check the output above for details.")


if __name__ == "__main__":
    asyncio.run(main())
