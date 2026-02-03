"""Sample configuration files for testing."""

from pathlib import Path

# Path to this configs directory
CONFIGS_DIR = Path(__file__).parent


def get_config_path(name: str) -> Path:
    """Get the path to a sample config file.

    Args:
        name: The config file name (e.g., "minimal.yaml")

    Returns:
        Path to the config file.
    """
    return CONFIGS_DIR / name
