import { useState } from 'react';
import styled from 'styled-components';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import type { Framework } from '../types';
import CodeSnippet from './code-snippet';

const GUIDES: Record<Framework, { title: string; description: string; code: string }> = {
    LANGGRAPH: {
        title: 'LangGraph Quick Start',
        description: 'Your graph definition should point to a file path and the compiled graph attribute.',
        code: `# ./agent/graph.py
from langgraph.graph import StateGraph, MessagesState

def chatbot(state: MessagesState):
    # your logic here
    return {"messages": state["messages"]}

graph = StateGraph(MessagesState)
graph.add_node("chatbot", chatbot)
graph.set_entry_point("chatbot")

# graph_definition = "./agent/graph.py:graph"`,
    },
    ADK: {
        title: 'ADK Quick Start',
        description: 'Provide the file path to your root agent and the application name.',
        code: `# ./agent/agent.py
from google.adk.agents import LlmAgent

root_agent = LlmAgent(
    model="gemini-2.0-flash",
    name="my_agent",
    instruction="You are a helpful assistant.",
)

# agent = "./agent/agent.py:root_agent"
# app_name = "my_adk_app"`,
    },
};

interface FrameworkGuideProps {
    framework: Framework;
}

export default function FrameworkGuide({ framework }: FrameworkGuideProps) {
    const [isOpen, setIsOpen] = useState(false);
    const guide = GUIDES[framework];

    return (
        <Container>
            <Toggle onClick={() => setIsOpen(!isOpen)}>
                <ToggleLeft>
                    <BookOpen size={14} />
                    <span>{guide.title}</span>
                </ToggleLeft>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Toggle>
            {isOpen && (
                <Content>
                    <Description>{guide.description}</Description>
                    <CodeSnippet code={guide.code} language="python" />
                </Content>
            )}
        </Container>
    );
}

const Container = styled.div`
    border: 1px solid rgba(140, 82, 255, 0.2);
    border-radius: 8px;
    background-color: rgba(140, 82, 255, 0.05);
    overflow: hidden;
`;

const Toggle = styled.button`
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: #c4b5fd;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: background-color 0.2s;

    &:hover {
        background-color: rgba(140, 82, 255, 0.1);
    }
`;

const ToggleLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const Content = styled.div`
    padding: 0 16px 16px;
`;

const Description = styled.p`
    font-size: 13px;
    color: #9ca3af;
    margin: 0 0 12px;
    line-height: 1.5;
`;
