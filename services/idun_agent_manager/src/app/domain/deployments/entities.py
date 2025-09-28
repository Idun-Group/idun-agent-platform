"""Domain entities/enums for deployments."""

from enum import Enum


class DeploymentMode(str, Enum):
    """Supported deployment modes."""

    LOCAL = "local"
    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"
