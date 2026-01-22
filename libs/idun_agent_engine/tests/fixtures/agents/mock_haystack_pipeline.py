# tests/fixtures/agents/mock_haystack_pipeline.py
from haystack.core.component import component
from haystack.core.pipeline import Pipeline


@component
class MockGenerator:
    @component.output_types(answer=str)
    def run(self, prompt: str):
        return {"answer": "Hello from mock Haystack!"}


mock_haystack_pipeline = Pipeline()
mock_haystack_pipeline.add_component("generator", MockGenerator())


@component
class MockAgentComponent:
    @component.output_types(answer=str)
    def run(self, query: str):
        return {"answer": f"The answer to '{query}' is 42."}


mock_haystack_agent = Pipeline()
mock_haystack_agent.add_component("agent", MockAgentComponent())
