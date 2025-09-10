"""Simple Groq Haystack Pipeline"""

from haystack import Pipeline
from haystack.utils import Secret
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator

template = "Answer: {{query}}"


def get_pipe():
    prompt_builder = PromptBuilder(template=template)
    generator = OpenAIGenerator(
        api_key=Secret.from_token("KEY"),
        model="llama-3.3-70b-versatile",
        api_base_url="https://api.groq.com/openai/v1"
    )
    pipeline = Pipeline()
    pipeline.add_component("prompt_builder", prompt_builder)
    pipeline.add_component("generator", generator)
    pipeline.connect("prompt_builder", "generator")
    return pipeline


pipe = get_pipe()
