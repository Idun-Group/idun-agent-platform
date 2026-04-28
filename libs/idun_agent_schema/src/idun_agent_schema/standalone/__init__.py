"""Standalone admin API contracts."""

from .agent import (  # noqa: F401
    StandaloneAgentPatch,
    StandaloneAgentRead,
)
from .auth import (  # noqa: F401
    StandaloneAuthChangePasswordBody,
    StandaloneAuthLoginBody,
    StandaloneAuthMe,
    StandaloneAuthMutationResult,
)
from .common import (  # noqa: F401
    StandaloneDeleteResult,
    StandaloneMutationResponse,
    StandaloneResourceIdentity,
    StandaloneSingletonDeleteResult,
)
from .config import (  # noqa: F401
    StandaloneMaterializedConfig,
)
from .diagnostics import (  # noqa: F401
    StandaloneConnectionCheck,
    StandaloneReadyzCheckStatus,
    StandaloneReadyzResponse,
    StandaloneReadyzStatus,
)
from .enrollment import (  # noqa: F401
    StandaloneEnrollmentInfo,
    StandaloneEnrollmentMode,
    StandaloneEnrollmentStatus,
)
from .errors import (  # noqa: F401
    StandaloneAdminError,
    StandaloneErrorCode,
    StandaloneFieldError,
)
from .guardrails import (  # noqa: F401
    StandaloneGuardrailCreate,
    StandaloneGuardrailPatch,
    StandaloneGuardrailRead,
)
from .integrations import (  # noqa: F401
    StandaloneIntegrationCreate,
    StandaloneIntegrationPatch,
    StandaloneIntegrationRead,
)
from .mcp_servers import (  # noqa: F401
    StandaloneMCPServerCreate,
    StandaloneMCPServerPatch,
    StandaloneMCPServerRead,
)
from .memory import (  # noqa: F401
    StandaloneMemoryPatch,
    StandaloneMemoryRead,
)
from .observability import (  # noqa: F401
    StandaloneObservabilityPatch,
    StandaloneObservabilityRead,
)
from .prompts import (  # noqa: F401
    StandalonePromptCreate,
    StandalonePromptPatch,
    StandalonePromptRead,
)
from .reload import (  # noqa: F401
    StandaloneReloadResult,
    StandaloneReloadStatus,
)
from .runtime_status import (  # noqa: F401
    StandaloneEngineCapabilities,
    StandaloneRuntimeAgent,
    StandaloneRuntimeConfigInfo,
    StandaloneRuntimeEngine,
    StandaloneRuntimeMCP,
    StandaloneRuntimeObservability,
    StandaloneRuntimeReload,
    StandaloneRuntimeStatus,
    StandaloneRuntimeStatusKind,
)
