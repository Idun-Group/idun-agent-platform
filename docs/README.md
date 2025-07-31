# Documentation

This folder contains comprehensive documentation for the Idun Agent Manager.

## Available Guides

### [ADK Agent Implementation Guide](./adk_agent_guide.md)
Complete guide for using the Google Agent Development Kit (ADK) implementation, including:
- Quick start tutorial
- Configuration options
- Streaming functionality
- Tool integration
- Session management
- Troubleshooting

### [SmolAgent Implementation Guide](./smol_agent_guide.md)
Complete guide for using the Hugging Face `smolagents` implementation.

## Agent Framework Support

The Idun Agent Manager currently supports:

| Framework | Status | Documentation |
|-----------|--------|---------------|
| **LangGraph** | ✅ Fully Implemented | See code examples in `tests/example_agents/` |
| **Google ADK** | ✅ Fully Implemented | [ADK Agent Guide](./adk_agent_guide.md) |
| **SmolAgent** | ✅ Fully Implemented | [SmolAgent Guide](./smol_agent_guide.md) |

## Quick Comparison

### LangGraph Agent
- **Best for**: Complex state-based workflows, graph-based agent architectures
- **Strengths**: Flexible state management, extensive ecosystem
- **Use cases**: Multi-step workflows, complex decision trees

### ADK Agent  
- **Best for**: Google Cloud environments, Gemini model integration
- **Strengths**: Native Google integration, built-in tools, enterprise features
- **Use cases**: Google ecosystem applications, production deployments

### SmolAgent
- **Best for**: Code-centric tasks, rapid prototyping with open models
- **Strengths**: Agents that think in code, flexible model backends, simple architecture
- **Use cases**: Web search, data analysis, code generation tasks

## Getting Started

1. **Choose your framework** based on your requirements
2. **Follow the setup guide** for your chosen framework
3. **Run the examples** in the `tests/` directory
4. **Build your first agent** using the provided templates

## Examples

### ADK Agent Example
```bash
cd tests
python test_adk_agent_creation.py
```

### SmolAgent Example
```bash
cd tests
python test_smol_agent_creation.py
```

### LangGraph Agent Example
```bash
cd tests
python test_langgraph_agent_creation.py
```

## API Usage

All agent types can be used through the same unified API:

```python
# Initialize agent (framework-specific)
agent = SmolAgent()  # or LanggraphAgent(), ADKAgent()
await agent.initialize(config)

# Use agent (same interface)
response = await agent.process_message(message)

# Stream events (same interface)
async for event in agent.process_message_stream(message):
    print(event.type)
```

## Contributing

When adding new documentation:

1. Keep guides focused and practical
2. Include working code examples
3. Add troubleshooting sections
4. Update this README with new content

## Support

For questions or issues:
1. Check the relevant framework documentation
2. Review the example implementations
3. Run the test suites to verify setup
4. Open an issue with specific details 