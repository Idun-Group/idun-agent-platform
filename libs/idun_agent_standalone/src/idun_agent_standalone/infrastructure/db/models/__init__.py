"""ORM models for the standalone DB.

Importing this module registers every model on ``Base.metadata`` so
``create_all`` and Alembic autogenerate see the full schema.
"""

from .agent import StandaloneAgentRow  # noqa: F401
from .memory import StandaloneMemoryRow  # noqa: F401
