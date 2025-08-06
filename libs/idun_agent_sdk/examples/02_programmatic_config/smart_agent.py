"""
Smart LangGraph Agent Example

This is a more advanced LangGraph agent that demonstrates:
- Multiple nodes and decision logic
- State management
- More complex conversation flow
"""

from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated, Literal
import operator
import random


class AgentState(TypedDict):
    """State structure for our smart agent."""
    messages: Annotated[list, operator.add]
    user_intent: str
    conversation_count: int


def analyze_intent(state):
    """Analyze the user's intent from their message."""
    last_message = state["messages"][-1] if state["messages"] else ""
    
    # Simple intent detection (in real scenarios, you'd use NLP models)
    intent = "general"
    if any(word in last_message.lower() for word in ["hello", "hi", "hey"]):
        intent = "greeting"
    elif any(word in last_message.lower() for word in ["help", "assist", "support"]):
        intent = "help"
    elif any(word in last_message.lower() for word in ["bye", "goodbye", "exit"]):
        intent = "farewell"
    elif "?" in last_message:
        intent = "question"
    
    return {
        "user_intent": intent,
        "conversation_count": state.get("conversation_count", 0) + 1
    }


def respond_greeting(state):
    """Handle greeting intents."""
    greetings = [
        "Hello! I'm your smart assistant. How can I help you today?",
        "Hi there! Great to meet you. What can I do for you?",
        "Hey! I'm here and ready to assist. What's on your mind?"
    ]
    
    response = random.choice(greetings)
    return {"messages": [("ai", response)]}


def respond_help(state):
    """Handle help requests."""
    help_message = """I'm a smart LangGraph agent that can:
- Answer your questions
- Provide assistance with various topics
- Have conversations
- Remember our chat history (thanks to checkpointing!)

Just ask me anything, and I'll do my best to help!"""
    
    return {"messages": [("ai", help_message)]}


def respond_question(state):
    """Handle question intents."""
    responses = [
        "That's an interesting question! While I'm a demo agent, I'd be happy to help you think through that.",
        "Great question! In a real implementation, I'd use advanced AI models to provide detailed answers.",
        "I love questions! This smart agent example shows how you can route different types of conversations."
    ]
    
    response = random.choice(responses)
    count = state.get("conversation_count", 0)
    
    if count > 3:
        response += f"\n\nBy the way, we've exchanged {count} messages now. Thanks to checkpointing, I remember our entire conversation!"
    
    return {"messages": [("ai", response)]}


def respond_farewell(state):
    """Handle farewell intents."""
    farewells = [
        "Goodbye! It was great chatting with you.",
        "See you later! Feel free to come back anytime.",
        "Take care! Thanks for trying out the smart agent example."
    ]
    
    response = random.choice(farewells)
    return {"messages": [("ai", response)]}


def respond_general(state):
    """Handle general conversation."""
    responses = [
        "That's interesting! Tell me more.",
        "I see! This smart agent can handle various types of conversations.",
        "Thanks for sharing! I'm learning about different conversation patterns."
    ]
    
    response = random.choice(responses)
    return {"messages": [("ai", response)]}


def route_conversation(state):
    """Route to the appropriate response based on intent."""
    intent = state.get("user_intent", "general")
    
    if intent == "greeting":
        return "greeting"
    elif intent == "help":
        return "help" 
    elif intent == "question":
        return "question"
    elif intent == "farewell":
        return "farewell"
    else:
        return "general"


def create_graph():
    """Create and return the smart LangGraph StateGraph."""
    graph = StateGraph(AgentState)
    
    # Add all nodes
    graph.add_node("analyze", analyze_intent)
    graph.add_node("greeting", respond_greeting)
    graph.add_node("help", respond_help)
    graph.add_node("question", respond_question)
    graph.add_node("farewell", respond_farewell)
    graph.add_node("general", respond_general)
    
    # Set entry point
    graph.set_entry_point("analyze")
    
    # Add conditional routing from analyze
    graph.add_conditional_edges(
        "analyze",
        route_conversation,
        {
            "greeting": "greeting",
            "help": "help", 
            "question": "question",
            "farewell": "farewell",
            "general": "general"
        }
    )
    
    # All response nodes lead to END
    for node in ["greeting", "help", "question", "farewell", "general"]:
        graph.add_edge(node, END)
    
    return graph


# This is the variable that the SDK will import
app = create_graph() 