import streamlit as st
import httpx
import json
import os

# --- Configuration ---
API_BASE_URL = "http://127.0.0.1:8000/api/v1"

# --- Helper Functions ---
def get_agents():
    """Fetches the list of all agents from the API."""
    try:
        response = httpx.get(f"{API_BASE_URL}/agents/")
        response.raise_for_status()
        return response.json()
    except httpx.RequestError as e:
        st.error(f"Failed to connect to API: {e}")
        return []
    except httpx.HTTPStatusError as e:
        st.error(f"API Error: {e.response.status_code} - {e.response.text}")
        return []

def create_agent(agent_data):
    """Creates a new agent via the API."""
    try:
        response = httpx.post(f"{API_BASE_URL}/agents/", json=agent_data)
        response.raise_for_status()
        st.success("Agent created successfully!")
        return True
    except httpx.RequestError as e:
        st.error(f"Failed to connect to API: {e}")
    except httpx.HTTPStatusError as e:
        st.error(f"API Error: {e.response.status_code} - {e.response.text}")
    return False

def delete_agent(agent_id):
    """Deletes an agent via the API."""
    try:
        response = httpx.delete(f"{API_BASE_URL}/agents/{agent_id}")
        response.raise_for_status()
        st.success(f"Agent {agent_id} deleted successfully!")
        return True
    except httpx.RequestError as e:
        st.error(f"Failed to connect to API: {e}")
    except httpx.HTTPStatusError as e:
        st.error(f"API Error: {e.response.status_code} - {e.response.text}")
    return False

def chat_with_agent(agent_id, session_id, query):
    """Sends a chat message to a specific agent."""
    request_body = {"session_id": session_id, "query": query}
    try:
        response = httpx.post(f"{API_BASE_URL}/agents/{agent_id}/chat", json=request_body)
        response.raise_for_status()
        return response.json().get("response", "No response content.")
    except httpx.RequestError as e:
        st.error(f"Failed to connect to API: {e}")
    except httpx.HTTPStatusError as e:
        st.error(f"API Error: {e.response.status_code} - {e.response.text}")
    return "Error: Could not get a response."

# --- UI Sections ---
def agent_management_section():
    """UI for listing, creating, and deleting agents."""
    st.header("Agent Management")

    # --- Create Agent Form ---
    with st.expander("Create New Agent", expanded=False):
        with st.form("create_agent_form"):
            st.write("Define a new agent configuration:")
            name = st.text_input("Agent Name*", help="A unique name for the agent.")
            description = st.text_area("Description")
            framework_type = st.selectbox("Framework*", ["LANGGRAPH", "ADK"])
            
            # --- LangGraph Specific Config ---
            if framework_type == "LANGGRAPH":
                agent_path = st.text_input("Agent Path*", "tests/example_agents/simple_graph.py:simple_test_graph")
                
                # Checkpoint configuration
                st.write("#### Checkpoint Configuration")
                checkpoint_type = st.selectbox("Type", ["sqlite"], key="lg_checkpoint")
                db_path = st.text_input("Database Path*", "checkpoint.db")

                config = {
                    "agent_path": agent_path,
                    "checkpoint": {"type": checkpoint_type, "db_path": db_path}
                }
            else:
                config = {} # Placeholder for other agent types like ADK

            submitted = st.form_submit_button("Create Agent")
            if submitted:
                if not name:
                    st.warning("Agent Name is required.")
                else:
                    agent_data = {
                        "name": name,
                        "description": description,
                        "framework_type": framework_type,
                        "config": config
                    }
                    if create_agent(agent_data):
                        st.rerun()

    # --- List Agents ---
    st.subheader("Available Agents")
    agents = get_agents()
    if not agents:
        st.info("No agents found. Create one above to get started.")
    else:
        for agent in agents:
            with st.container(border=True):
                col1, col2 = st.columns([4, 1])
                with col1:
                    st.subheader(f"{agent['name']} ({agent['framework_type']})")
                    st.caption(f"ID: {agent['id']}")
                    st.write(agent.get('description', 'No description.'))
                    with st.expander("View Full Configuration"):
                        st.json(agent['config'])
                with col2:
                    if st.button("Delete", key=f"delete_{agent['id']}"):
                        if delete_agent(agent['id']):
                            st.rerun()


def agent_chat_section():
    """UI for chatting with an agent."""
    st.header("Chat with an Agent")
    agents = get_agents()
    agent_options = {agent['name']: agent['id'] for agent in agents}

    if not agent_options:
        st.warning("No agents available. Please create an agent first.")
        return

    selected_agent_name = st.selectbox("Select an Agent", options=agent_options.keys())
    selected_agent_id = agent_options.get(selected_agent_name)

    if selected_agent_id:
        # --- Chat Interface ---
        session_id = f"st-chat-{selected_agent_id}"

        if "messages" not in st.session_state:
            st.session_state.messages = {}
        
        if session_id not in st.session_state.messages:
            st.session_state.messages[session_id] = []

        # Display chat history
        for message in st.session_state.messages[session_id]:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])

        # Chat input
        if prompt := st.chat_input("What is up?"):
            st.session_state.messages[session_id].append({"role": "user", "content": prompt})
            with st.chat_message("user"):
                st.markdown(prompt)

            with st.spinner("Agent is thinking..."):
                response = chat_with_agent(selected_agent_id, session_id, prompt)
                st.session_state.messages[session_id].append({"role": "assistant", "content": response})
                with st.chat_message("assistant"):
                    st.markdown(response)


# --- Main App ---
st.set_page_config(page_title="Idun Agent Manager", layout="wide")
st.title("Idun Agent Manager UI")
st.write("A prototype UI to manage and interact with your AI agents via the Agent Manager API.")

# Use tabs for different sections
tab1, tab2 = st.tabs(["Agent Management", "Chat"])

with tab1:
    agent_management_section()
with tab2:
    agent_chat_section() 