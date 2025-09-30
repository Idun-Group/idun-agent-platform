"""Legacy stub for engine client; deployments are not handled here anymore."""

from app.core.logging import get_logger

logger = get_logger(__name__)


class IdunEngineService:  # pragma: no cover - transitional stub
    """Kept temporarily to avoid breaking imports; does nothing."""

    def __init__(self) -> None:  # noqa: D401
        """No-op initializer."""
        pass
