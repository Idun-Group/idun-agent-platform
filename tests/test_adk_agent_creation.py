"""
Test script for ADK agent creation and functionality.
"""

import asyncio
import sys
import os

# Add the project root to the path so we can import our modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from idun_agent_manager.core.agents.adk_agent_impl import ADKAgent
from tests.example_agents_adk.simple_adk_agent import AGENT_CONFIG


async def test_adk_agent_creation():
    """Test creating an ADK agent and running basic operations."""
    print("Testing ADK Agent Creation...")
    
    try:
        # Create the agent
        agent = ADKAgent()
        print(f"✅ Agent created with ID: {agent.id}")
        
        # Initialize the agent with the configuration
        print("Initializing agent...")
        await agent.initialize(AGENT_CONFIG)
        print(f"✅ Agent initialized: {agent.name}")
        print(f"   Agent type: {agent.agent_type}")
        print(f"   Status: {agent.infos['status']}")
        
        # Test basic message processing
        print("\nTesting message processing...")
        test_message = {
            "query": "What's the weather like in Paris?",
            "session_id": "test_session_001"
        }
        
        response = await agent.process_message(test_message)
        print(f"✅ Response received: {response}")
        
        # Test session management
        print("\nTesting session management...")
        session = agent.get_session("test_session_001")
        print(f"✅ Session retrieved: {session}")
        
        # Test workflow information
        print("\nTesting workflow info...")
        workflow = agent.get_workflow()
        print(f"✅ Workflow: {workflow}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_adk_agent_streaming():
    """Test the streaming functionality of the ADK agent."""
    print("\n" + "="*50)
    print("Testing ADK Agent Streaming...")
    
    try:
        # Create and initialize the agent
        agent = ADKAgent()
        await agent.initialize(AGENT_CONFIG)
        
        # Test streaming with a weather query
        print("\nTesting streaming with weather query...")
        test_message = {
            "query": "What's the weather like in Tokyo?",
            "session_id": "test_session_streaming"
        }
        
        event_count = 0
        async for event in agent.process_message_stream(test_message):
            event_count += 1
            print(f"📡 Event {event_count}: {event.type}")
            if hasattr(event, 'delta'):
                print(f"   Content: {event.delta}")
            elif hasattr(event, 'title'):
                print(f"   Title: {event.title}")
            elif hasattr(event, 'tool_call_name'):
                print(f"   Tool: {event.tool_call_name}")
        
        print(f"✅ Streaming test completed with {event_count} events")
        return True
        
    except Exception as e:
        print(f"❌ Error during streaming test: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_adk_math_functionality():
    """Test the math functionality of the ADK agent."""
    print("\n" + "="*50)
    print("Testing ADK Agent Math Functionality...")
    
    try:
        # Create and initialize the agent
        agent = ADKAgent()
        await agent.initialize(AGENT_CONFIG)
        
        # Test math query
        print("\nTesting math calculation...")
        test_message = {
            "query": "What is 15 + 27?",
            "session_id": "test_session_math"
        }
        
        response = await agent.process_message(test_message)
        print(f"✅ Math response: {response}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during math test: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    print("🧪 Starting ADK Agent Tests")
    print("="*50)
    
    # Check if ADK is available
    try:
        import google.adk
        print("✅ google-adk package is available")
    except ImportError:
        print("❌ google-adk package not found. Please install it with: pip install google-adk")
        print("   Skipping ADK tests...")
        return
    
    # Run tests
    tests = [
        ("Basic Agent Creation", test_adk_agent_creation()),
        ("Math Functionality", test_adk_math_functionality()),
        ("Streaming Functionality", test_adk_agent_streaming())
    ]
    
    results = []
    for test_name, test_coro in tests:
        print(f"\n🧪 Running: {test_name}")
        try:
            result = await test_coro
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results.append((test_name, False))
    
    # Print summary
    print("\n" + "="*50)
    print("📊 TEST SUMMARY")
    print("="*50)
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