import asyncio
from langgraph.graph import StateGraph, MessagesState
from langchain_google_vertexai import ChatVertexAI


# Add a sleep node that waits 3 seconds
async def sleep_node(state: MessagesState):
    """Sleep for 3 seconds."""
    await asyncio.sleep(3)
    return state


llm = ChatVertexAI(
    model="gemini-2.0-flash-lite",
    temperature=0,
    max_tokens=100,
    max_retries=6,
    stop=None,
    # other params...
)


# This is a very simple echo agent that uses MessagesState.
async def echo_node(state: MessagesState):
    """Takes the conversation history and invokes the Gemini model."""
    response = await llm.ainvoke(state["messages"])
    return {"messages": [response]}


# Define the graph
builder = StateGraph(MessagesState)
builder.add_node("sleep", sleep_node)
builder.add_node("echo", echo_node)
builder.set_entry_point("sleep")
builder.add_edge("sleep", "echo")
builder.set_finish_point("echo")

# The variable to be loaded by the agent manager
simple_test_graph = builder
