"""ORM models for the standalone DB.

Importing this module registers every model on ``Base.metadata`` so
``create_all`` and Alembic autogenerate see the full schema.
"""

from .agent import StandaloneAgentRow  # noqa: F401
from .guardrail import StandaloneGuardrailRow  # noqa: F401
from .integration import StandaloneIntegrationRow  # noqa: F401
from .mcp_server import StandaloneMCPServerRow  # noqa: F401
from .memory import StandaloneMemoryRow  # noqa: F401
from .observability import StandaloneObservabilityRow  # noqa: F401
from .prompt import StandalonePromptRow  # noqa: F401
from .runtime_state import StandaloneRuntimeStateRow  # noqa: F401
