"""Provider-agnostic observability configuration model (engine-scoped)."""

from __future__ import annotations

import os
from typing import Any

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from enum import Enum


class ObservabilityProvider(str, Enum):
    """Supported observability providers."""

    LANGFUSE = "LANGFUSE"
    PHOENIX = "PHOENIX"
    # PHOENIX_LOCAL = "PHOENIX_LOCAL"
    GCP_LOGGING = "GCP_LOGGING"
    GCP_TRACE = "GCP_TRACE"
    LANGSMITH = "LANGSMITH"


class ObservabilityConfig(BaseModel):
    """Observability configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    provider: ObservabilityProvider = Field(default=ObservabilityProvider.LANGFUSE)
    enabled: bool = Field(default=True)
    config: (
        LangfuseConfig
        | PhoenixConfig
        | GCPLoggingConfig
        | GCPTraceConfig
        | LangsmithConfig
    )


class LangfuseConfig(BaseModel):
    """Langfuse configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    host: str = Field(default="https://cloud.langfuse.com")
    public_key: str = Field(default="")
    secret_key: str = Field(default="")
    run_name: str = Field(default="")


class PhoenixConfig(BaseModel):
    """Phoenix configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    collector_endpoint: str = Field(default="https://collector.phoenix.com")
    project_name: str = Field(default="")


# class PhoenixLocalConfig(BaseModel):
#     """Phoenix Local configuration."""
#
#     collector_endpoint: str = Field(default="http://0.0.0.0:6006")
#     project_name: str = Field(default="")


class GCPLoggingConfig(BaseModel):
    """GCP Logging configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    project_id: str = Field(
        default="",
        alias="gcpProjectId",
        description="The project identifier where logs and traces will be sent.",
    )
    region: str = Field(
        default="",
        description="(Optional) The specific region/zone associated with the resource (e.g., us-central1).",
    )
    log_name: str = Field(
        default="",
        description="The identifier for the log stream (e.g., application-log).",
    )
    resource_type: str = Field(
        default="",
        description="The resource type label (e.g., global, gce_instance, cloud_run_revision).",
    )
    severity: str = Field(
        default="INFO",
        description="Minimum level to record (e.g., INFO, WARNING, ERROR, CRITICAL).",
    )
    transport: str = Field(
        default="BackgroundThread",
        description="Selection for delivery method (e.g., BackgroundThread vs Synchronous).",
    )


class GCPTraceConfig(BaseModel):
    """GCP Trace configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    project_id: str = Field(
        default="",
        alias="gcpProjectId",
        description="The project identifier where logs and traces will be sent.",
    )
    region: str = Field(
        default="",
        description="(Optional) The specific region/zone associated with the resource (e.g., us-central1).",
    )
    trace_name: str = Field(
        default="", description="The name for the trace or tracing session."
    )
    sampling_rate: float = Field(
        default=1.0,
        ge=0,
        le=1,
        description="A number between 0.0 and 1.0 indicating the probability of a request being traced (e.g., 1.0 for 100%, 0.1 for 10%).",
    )
    flush_interval: int = Field(
        default=5,
        ge=0,
        description="Time in seconds to wait before sending buffered traces to the cloud.",
    )
    ignore_urls: str = Field(
        default="",
        description="A list or comma-separated string of URL paths to exclude from tracing (e.g., /health, /metrics).",
    )


class LangsmithConfig(BaseModel):
    """Langsmith configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    api_key: str = Field(
        default="",
        description="The unique authentication key from the LangSmith settings page.",
    )
    project_id: str = Field(
        default="",
        description="The project identifier (corresponds to project id in LangSmith).",
    )
    project_name: str = Field(
        default="",
        description="The name of the project in LangSmith to bucket these traces under (e.g., prod-chatbot-v1).",
    )
    endpoint: str = Field(
        default="",
        description="The URL endpoint, used primarily if you are self-hosting LangSmith or using a specific enterprise instance. (e.g., https://api.smith.langchain.com)",
    )
    trace_name: str = Field(
        default="", description="The name for the trace or tracing session."
    )
    tracing_enabled: bool = Field(
        default=False, description="A toggle to globally turn tracing on or off."
    )
    capture_inputs_outputs: bool = Field(
        default=False,
        description="A toggle to decide if the full text of LLM inputs and outputs should be logged.",
    )
