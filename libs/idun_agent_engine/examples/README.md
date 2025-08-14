# Idun Agent Engine Examples

Welcome to the Idun Agent Engine examples! These examples demonstrate different ways to use the Engine, from the simplest possible setup to more advanced configurations.

## 🎯 Learning Path

We recommend following the examples in this order:

### 1. [Minimal Setup](./03_minimal_setup/) - Start Here! ⭐
**Perfect for**: First-time users, quick prototyping, demos

The absolute simplest way to get an agent running. Just one function call!

```bash
cd 03_minimal_setup
python main.py
```

**What you'll learn**: The most basic Engine usage pattern

---

### 2. [Basic Configuration File](./01_basic_config_file/) - Production Ready 🏗️
**Perfect for**: Production deployments, team environments, configuration management

Learn how to use YAML configuration files for declarative agent setup.

```bash
cd 01_basic_config_file
python main.py
```

**What you'll learn**:
- YAML configuration structure
- Checkpointer setup
- Environment-specific configs

---

### 3. [Programmatic Configuration](./02_programmatic_config/) - Advanced 🔧
**Perfect for**: Dynamic configuration, complex deployments, type safety

Discover the ConfigBuilder API for programmatic configuration.

```bash
cd 02_programmatic_config
python main.py basic
python main.py environment
python main.py conditional
python main.py save
```

**What you'll learn**:
- ConfigBuilder fluent API
- Environment-based configuration
- Conditional configuration logic
- Saving configurations to YAML

## 🚀 Quick Test Commands

Once any example is running, test it with:

```bash
# Test the invoke endpoint
curl -X POST "http://localhost:8000/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello!", "session_id": "test-123"}'

# Test the streaming endpoint
curl -X POST "http://localhost:8000/agent/stream" \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me a story", "session_id": "test-123"}'

# Check server health
curl "http://localhost:8000/health"

# View API documentation
open http://localhost:8000/docs
```

## 📋 Prerequisites

All examples require these dependencies:

```bash
pip install fastapi uvicorn langgraph aiosqlite pydantic
```

## 🗂️ Example Comparison

| Feature | Minimal Setup | Basic Config File | Programmatic Config |
|---------|---------------|-------------------|-------------------|
| **Complexity** | Lowest | Medium | Highest |
| **Lines of Code** | ~5 | ~15 | ~50+ |
| **Configuration** | Minimal YAML | Full YAML | Python Code |
| **Flexibility** | Low | Medium | High |
| **Type Safety** | No | Partial | Full |
| **Best For** | Learning, Demos | Production | Complex Deployments |

## 🎓 Learning Objectives

By working through these examples, you'll understand:

### Core Concepts
- How to structure LangGraph agents for the Engine
- Different configuration approaches
- Server lifecycle management
- API endpoint usage

### Configuration Management
- YAML vs programmatic configuration
- Environment-specific settings
- Checkpointer setup for persistence
- Dynamic configuration patterns

### Development Workflow
- Development vs production settings
- Hot reloading during development
- Testing your agents
- Deployment patterns

## 🔧 Customization Ideas

Try modifying the examples to:

1. **Change Agent Behavior**:
   - Add new nodes to the LangGraph
   - Implement different conversation flows
   - Add external API calls

2. **Modify Configuration**:
   - Change server ports
   - Add custom middleware
   - Configure different checkpointers

3. **Extend Functionality**:
   - Add authentication
   - Implement rate limiting
   - Add custom endpoints

## 🐛 Troubleshooting

### Common Issues

**Import Error**: Make sure you're running from the correct directory and have all dependencies installed.

**Port Already in Use**: Change the port in the configuration file or stop other services using that port.

**Agent Not Loading**: Check that your graph definition path is correct and the file exists.

**Database Errors**: Ensure the directory for SQLite checkpointer files exists and is writable.

### Getting Help

1. Check the [main Engine documentation](../README_USER_API.md)
2. Look at the specific example's README
3. Examine the error messages in the console
4. Try the minimal example first to isolate issues

## 🚀 Next Steps

After completing these examples:

1. **Build Your Own Agent**: Create a custom LangGraph agent for your use case
2. **Production Deployment**: Learn about deployment options in the main docs
3. **Advanced Features**: Explore custom middleware, authentication, and monitoring
4. **Contribute**: Consider contributing new examples or improvements!

## 📚 Additional Resources

- [Idun Agent Engine Documentation](../README_USER_API.md)
- [LangGraph Documentation](https://python.langchain.com/docs/langgraph)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Agent Adapters](../src/agent/)
