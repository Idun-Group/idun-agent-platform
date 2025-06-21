from langgraph.graph import StateGraph, MessagesState
from langchain_core.messages import AIMessage

# This is a very simple echo agent that uses MessagesState.
def echo_node(state: MessagesState):
    """Takes the last message and echoes it back."""
    last_message = state["messages"][-1]
    response_content = f"You said: {last_message.content}"
    return {"messages": [AIMessage(content=response_content)]}

# Define the graph
builder = StateGraph(MessagesState)
builder.add_node("echo", echo_node)
builder.set_entry_point("echo")
builder.set_finish_point("echo")

# The variable to be loaded by the agent manager
simple_test_graph = builder 