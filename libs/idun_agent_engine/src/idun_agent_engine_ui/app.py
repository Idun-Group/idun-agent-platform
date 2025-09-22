import json
import logging
from typing import Any

import requests
import streamlit as st

logging.basicConfig(
    format="%(asctime)s %(levelname)-8s %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


def send_message(message: list[dict[str, Any]]) -> dict[str, str]:
    """Sends the message to the API."""
    try:
        logger.debug("Sending request to API")
        response = requests.post(
            "http://localhost:8000/agent/invoke",
            json={"session_id": "123", "query": json.dumps(message)},
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
    st.title("Idun Agent Platform UI")
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
                response = send_message(st.session_state.messages)
            st.markdown(response)
        st.session_state.messages.append({"role": "assistant", "content": response})

    with st.expander("Chat History"):
        st.json(st.session_state.messages)


if __name__ == "__main__":
    main()
