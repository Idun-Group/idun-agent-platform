# tests/fixtures/agents/mock_haystack_pipeline.py
from haystack.core.component import component
from haystack.core.pipeline import Pipeline


@component
class MockGenerator:
    @component.output_types(replies=list)
    def run(self, query: str):
        return {"replies": [f"Response to: {query}"]}


mock_haystack_pipeline = Pipeline()
mock_haystack_pipeline.add_component("generator", MockGenerator())
