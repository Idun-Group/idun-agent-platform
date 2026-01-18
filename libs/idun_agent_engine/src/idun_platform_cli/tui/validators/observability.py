from idun_agent_schema.engine.observability_v2 import (
    ObservabilityConfig,
    ObservabilityProvider,
)


def validate_observability(
    provider: ObservabilityProvider, config
) -> tuple[ObservabilityConfig | None, str]:
    match provider:
        case ObservabilityProvider.LANGFUSE:
            from idun_agent_schema.engine.observability_v2 import LangfuseConfig

            try:
                config = LangfuseConfig(**config)
                return ObservabilityConfig(
                    provider=provider, config=config, enabled=True
                ), "ok"
            except Exception as e:
                return None, f"Error validating Langfuse config: {e}"

        case ObservabilityProvider.PHOENIX:
            from idun_agent_schema.engine.observability_v2 import PhoenixConfig

            try:
                config = PhoenixConfig(**config)
                return ObservabilityConfig(
                    provider=provider, config=config, enabled=True
                ), "ok"
            except Exception as e:
                return None, f"Error validating Phoenix config: {e}"

        case ObservabilityProvider.GCP_LOGGING:
            from idun_agent_schema.engine.observability_v2 import GCPLoggingConfig

            try:
                config = GCPLoggingConfig(**config)
                return ObservabilityConfig(
                    provider=provider, config=config, enabled=True
                ), "ok"
            except Exception as e:
                return None, f"Error validating GCP logging config: {e}"

        case ObservabilityProvider.GCP_TRACE:
            from idun_agent_schema.engine.observability_v2 import GCPTraceConfig

            try:
                config = GCPTraceConfig(**config)
                return ObservabilityConfig(
                    provider=provider, config=config, enabled=True
                ), "ok"
            except Exception as e:
                return None, f"Error validating GCP trace config: {e}"

        case ObservabilityProvider.LANGSMITH:
            from idun_agent_schema.engine.observability_v2 import LangsmithConfig

            try:
                config = LangsmithConfig(**config)

                return ObservabilityConfig(
                    provider=provider, config=config, enabled=True
                ), "ok"
            except Exception as e:
                return None, f"Error validating Langsmith config: {e}"
