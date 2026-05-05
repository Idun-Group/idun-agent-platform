"""LangGraph: realistic Self-RAG-style multi-node graph with conditional edges."""
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


class State(TypedDict):
    messages: Annotated[list, add_messages]
    documents: list[str]
    question: str
    retry_count: int


def retrieve(state: State) -> State:
    return {"documents": ["doc1", "doc2"]}


def grade_documents(state: State) -> State:
    return {}


def generate(state: State) -> State:
    return {"messages": [AIMessage(content="answer")]}


def transform_query(state: State) -> State:
    return {"retry_count": state.get("retry_count", 0) + 1}


def decide_to_generate(state: State) -> str:
    if state.get("retry_count", 0) > 3:
        return "generate"
    return "transform_query"


def grade_generation(state: State) -> str:
    if state.get("retry_count", 0) > 5:
        return "useful"
    return "not useful"


_b = StateGraph(State)
_b.add_node("retrieve", retrieve)
_b.add_node("grade_documents", grade_documents)
_b.add_node("generate", generate)
_b.add_node("transform_query", transform_query)

_b.add_edge(START, "retrieve")
_b.add_edge("retrieve", "grade_documents")
_b.add_conditional_edges(
    "grade_documents",
    decide_to_generate,
    {"transform_query": "transform_query", "generate": "generate"},
)
_b.add_edge("transform_query", "retrieve")
_b.add_conditional_edges(
    "generate",
    grade_generation,
    {"not useful": "transform_query", "useful": END},
)

graph = _b.compile()
