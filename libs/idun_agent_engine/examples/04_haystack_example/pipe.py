"""Simple Groq Haystack Pipeline"""

from haystack import Pipeline
from haystack.utils import Secret
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator

template = "Answer: {{query}}"

import os

os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-04f9f0ce-ac1d-4e5a-9fd8-17b88ed9085d"
os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-56e5f358-5493-417c-993b-bdca2ac192bc"


from haystack_integrations.components.connectors.langfuse import (
    LangfuseConnector,
)

def get_pipe():
    prompt_builder = PromptBuilder(template=template)
    generator = OpenAIGenerator(
        api_key=Secret.from_token("key"),
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
