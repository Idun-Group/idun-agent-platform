"""Simple Groq Haystack Pipeline"""

from haystack import Pipeline
from haystack.utils import Secret
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator

from dotenv import load_dotenv


load_dotenv()
template = "Answer the next message (return the answer to the last user query in normal text and not json, based on the conversation history), given the prior json holding the conversation: {{query}}"


from haystack_integrations.components.connectors.langfuse import (
    LangfuseConnector,
)

def get_pipe():
    prompt_builder = PromptBuilder(template=template)
    generator = OpenAIGenerator(
        api_key=Secret.from_env_var("GROQ_API_KEY"),
        model="llama-3.3-70b-versatile",
        api_base_url="https://api.groq.com/openai/v1"
    )
    pipeline = Pipeline()
    pipeline.add_component("own tracer", LangfuseConnector("own tracer"))
    pipeline.add_component("prompt_builder", prompt_builder)
    pipeline.add_component("generator", generator)
    pipeline.connect("prompt_builder", "generator")
    return pipeline

pipe = get_pipe()
