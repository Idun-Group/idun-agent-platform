"""Provider-agnostic observability configuration model (engine-scoped)."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class ObservabilityProvider(str, Enum):
    """Supported observability providers."""

    LANGFUSE = "LANGFUSE"
    PHOENIX = "PHOENIX"
    GCP_LOGGING = "GCP_LOGGING"
    GCP_TRACE = "GCP_TRACE"
    LANGSMITH = "LANGSMITH"


class LangfuseConfig(BaseModel):
    """Langfuse configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    provider: Literal[ObservabilityProvider.LANGFUSE] = (
        ObservabilityProvider.LANGFUSE
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

    provider: Literal[ObservabilityProvider.PHOENIX] = ObservabilityProvider.PHOENIX
    collector_endpoint: str = Field(default="https://collector.phoenix.com")
    project_name: str = Field(default="")


class GCPLoggingConfig(BaseModel):
    """GCP Logging configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    provider: Literal[ObservabilityProvider.GCP_LOGGING] = (
        ObservabilityProvider.GCP_LOGGING
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

    provider: Literal[ObservabilityProvider.GCP_TRACE] = (
        ObservabilityProvider.GCP_TRACE
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

    provider: Literal[ObservabilityProvider.LANGSMITH] = (
        ObservabilityProvider.LANGSMITH
    )
    api_key: str = Field(
        default="",
        description="The unique authentication key from the LangSmith settings page.",
    )
    project_name: str = Field(
        default="",
        description="The name of the project in LangSmith to bucket these traces under (e.g., prod-chatbot-v1).",
    )
    endpoint: str = Field(
        default="",
        description="The URL endpoint, used primarily if you are self-hosting LangSmith or using a specific enterprise instance. (e.g., https://api.smith.langchain.com)",
    )
    run_name: str = Field(
        default="",
        description="The display name for each trace run in LangSmith (e.g., my-agent).",
    )


ProviderConfig = Annotated[
    LangfuseConfig
    | PhoenixConfig
    | GCPLoggingConfig
    | GCPTraceConfig
    | LangsmithConfig,
    Field(discriminator="provider"),
]


class ObservabilityConfig(BaseModel):
    """Observability configuration."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    provider: ObservabilityProvider = Field(default=ObservabilityProvider.LANGFUSE)
    enabled: bool = Field(default=True)
    config: ProviderConfig

    @model_validator(mode="before")
    @classmethod
    def _stamp_inner_provider_for_dict_input(cls, data: Any) -> Any:
        """Inject the discriminator field into ``config`` when callers pass dicts.

        The shipping YAML shape places ``provider`` only on the parent
        ``ObservabilityConfig``; the inner ``config`` block is bare
        provider-specific keys (no ``provider`` field). Pydantic's
        discriminated-union machinery runs *before* per-member defaults
        are applied, so the ``Literal[...]`` defaults on each provider
        config cannot rescue dict input — discrimination fails with
        ``union_tag_not_found``.

        This validator copies the parent's ``provider`` (or defaults to
        ``LANGFUSE``) into the inner dict so the discriminator can
        resolve. It deliberately does *not* reconcile mismatched
        explicit values: when the inner dict already carries a
        ``provider`` that disagrees with the parent, both are stamped
        so the ``mode="after"`` validator can raise its clear error.
        """
        if not isinstance(data, dict):
            return data

        # Tolerate camelCase alias inbound, though only ``provider``
        # exists on this model and to_camel("provider") == "provider".
        config_value = data.get("config")
        if not isinstance(config_value, dict):
            return data

        inner_provider = config_value.get("provider")
        parent_provider = data.get("provider")

        # Pick the discriminator: prefer an explicit inner value, then
        # the parent value, then the model default. Leave the parent
        # untouched if it was explicit and disagrees with the inner —
        # the after-validator surfaces that as a clear error.
        if inner_provider is None:
            chosen = (
                parent_provider
                if parent_provider is not None
                else ObservabilityProvider.LANGFUSE.value
            )
            # Normalize enum members to their value for the discriminator.
            if isinstance(chosen, ObservabilityProvider):
                chosen = chosen.value
            config_value["provider"] = chosen

        if parent_provider is None:
            data["provider"] = config_value["provider"]

        return data

    @model_validator(mode="after")
    def _sync_provider_with_config(self) -> ObservabilityConfig:
        """Keep parent.provider in sync with config.provider.

        Cases handled:

        - Both fields agree (the typical, explicit pattern) — no-op.
        - Parent.provider was left at the default but config was set
          (the ergonomic pattern: caller passed only the typed inner
          config) — parent is updated to match the inner provider.
        - Parent.provider was explicitly set and disagrees with
          config.provider — raise a clear ``ValueError``.

        Note on the discriminator: Pydantic's ``Field(discriminator=...)``
        catches mismatches only when ``config`` is supplied as a ``dict``
        whose ``provider`` literal disagrees with the dict's shape. When
        ``config`` is passed as an already-typed model instance (e.g.
        ``ObservabilityConfig(provider=LANGFUSE, config=PhoenixConfig())``)
        the discriminator accepts it and the parent's ``provider`` field
        is independent. This validator closes that gap so the SPEC's
        acceptance criterion ("mismatch fails at validation time with a
        clear error") holds for both call shapes.
        """
        inner_provider = self.config.provider

        # Detect explicit-mismatch: only raise when the caller actually
        # set `provider` on the parent. Defaulted parent + explicit
        # inner is the ergonomic back-compat case and must auto-sync.
        if (
            "provider" in self.__pydantic_fields_set__
            and self.provider != inner_provider
        ):
            raise ValueError(
                "ObservabilityConfig.provider "
                f"({self.provider.value!r}) does not match the "
                f"discriminated config.provider ({inner_provider.value!r}). "
                "Either omit ObservabilityConfig.provider so it auto-syncs, "
                "or pass a config matching the parent provider."
            )

        # config.provider is always set (Literal default). Mirror it
        # onto the parent so consumers reading .provider see the truth.
        self.provider = inner_provider
        return self
