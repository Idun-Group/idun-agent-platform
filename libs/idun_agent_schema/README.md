# Idun Agent Schema

Centralized Pydantic schema library shared by Idun Agent Engine and Idun Agent Manager.

## Install

```bash
pip install idun-agent-schema
```

## Usage

```python
from idun_agent_schema.engine import EngineConfig
from idun_agent_schema.manager.api import AgentCreateRequest
```

This package re-exports stable schema namespaces to avoid breaking existing imports. Prefer importing from this package directly going forward.
