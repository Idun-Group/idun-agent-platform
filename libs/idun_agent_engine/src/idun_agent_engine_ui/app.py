import json
import logging
from typing import Any, Optional
import requests
import streamlit as st


logging.basicConfig(
    format="%(asctime)s %(levelname)-8s %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def get_agent_config() -> dict[str, Any]:
    """Get agent config."""
    try:
        response = requests.get("http://localhost:8000/agent/config")
        assert response.status_code == 200
        return response.json()
    except Exception as e:
        logger.error(f"Error fetching agent config: {e}")
        return {}


def send_message(message: list[dict[str, Any]], session_id: str) -> dict[str, str]:
    """Sends the message to the API."""
    try:
        logger.debug("Sending request to API")
        response = requests.post(
            "http://localhost:8000/agent/invoke",
            json={"session_id": session_id, "query": json.dumps(message)},
        )
        assert response.status_code == 200
        logger.info("Request sent with success")
        if "response" not in response.json():
            logger.error("Error retrieving info from api: No response found from llm")
            raise ValueError("No response found from llm")
        return response.json()["response"]
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        return {"error": f"{e}"}


def main() -> None:
    """Entrypoint of the app."""
    st.set_page_config(page_title="Idun Agent Platform UI", layout="wide")
    st.title("Idun Agent Platform UI")

    config = get_agent_config()

    with st.sidebar:
        st.header("Configuration")

        session_id = st.text_input(
            "Session ID",
            value=st.session_state.get("session_id", "123"),
            key="session_id_input",
        )
        st.session_state.session_id = session_id

        if st.button("Clear Chat"):
            st.session_state.messages = []
            st.rerun()

        st.divider()

        st.subheader("Agent Information")
        if config:
            agent_name = config.get("config", {}).get("name", "Unnamed Agent")

            st.text(f"Name: {agent_name}")

            with st.expander("Full Config"):
                st.json(config)
        else:
            st.error("Unable to fetch agent configuration")

    if "messages" not in st.session_state:
        st.session_state.messages = []

    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    if prompt := st.chat_input("Send a Message"):
        st.session_state.messages.append({"role": "user", "content": prompt})

        with st.chat_message("user"):
            st.markdown(prompt)

        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                response = send_message(st.session_state.messages, session_id)
            st.markdown(response)

        st.session_state.messages.append({"role": "assistant", "content": response})

    with st.expander("Chat History"):
        st.json(st.session_state.messages)


if __name__ == "__main__":
    main()
