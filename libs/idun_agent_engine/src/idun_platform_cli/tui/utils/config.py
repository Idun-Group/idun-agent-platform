from pathlib import Path
from typing import Any

import yaml
from idun_agent_schema.engine.guardrails_v2 import GuardrailsV2
from idun_agent_schema.engine.observability_v2 import ObservabilityConfig
from pydantic import ValidationError

from idun_platform_cli.tui.schemas.create_agent import (
    TUIAgentConfig,
)


class ConfigManager:
    def __init__(self):
        self.idun_dir = Path.home() / ".idun"
        self.agent_path = None
        try:
            self.idun_dir.mkdir(exist_ok=True)

        except OSError as e:
            raise ValueError(
                f"Error while preparing `.idun` config file: {e}\nNote: This file is used to store config and env data"
            ) from e

    def _sanitize_agent_name(self, agent_name: str) -> str:
        return agent_name.lstrip().replace("-", "_").replace(" ", "_")

    def _validate_data(
        self, config: dict[str, Any]
    ) -> tuple[TUIAgentConfig | None, str]:
        try:
            return TUIAgentConfig.model_validate(config), "valid"
        except Exception as e:
            return None, f"Error: cannot validate config: {e}"

    def save_config(self, config: dict) -> tuple[bool, str]:
        try:
            raw_agent_name: str = config["name"]
        except KeyError as e:
            raise ValueError(
                "Agent name is not defined! Make sure you specify a name for your agent!"
            ) from e
        sanitized_agent_name = self._sanitize_agent_name(raw_agent_name)
        self.agent_path = (self.idun_dir / sanitized_agent_name).with_suffix(".yaml")

        with self.agent_path.open("w") as f:
            serialized, msg = self._validate_data(config)
            if serialized is None:
                return False, msg
            with self.agent_path.open("w") as f:
                yaml.dump(serialized.to_engine_config(), f, default_flow_style=False)
            return True, "Valid"

    def load_draft(self) -> dict | None:
        if self.agent_path is None or not self.agent_path.exists():
            raise ValueError(
                "No agent config file found. Make sure you have saved agent configs."
            )
        with self.agent_path.open("r") as f:
            return yaml.safe_load(f) or {}

    def save_partial(
        self, section: str, data: dict | Any, agent_name: str = None
    ) -> tuple[bool, str]:
        try:
            from idun_agent_engine.core.engine_config import EngineConfig

            if agent_name:
                sanitized_agent_name = self._sanitize_agent_name(agent_name)
                self.agent_path = (self.idun_dir / sanitized_agent_name).with_suffix(
                    ".yaml"
                )

            if self.agent_path is None:
                return False, "Agent name not set. Save identity section first."

            existing_config = {}
            if self.agent_path.exists():
                with self.agent_path.open("r") as f:
                    existing_config = yaml.safe_load(f) or {}

            if section == "identity":
                from idun_platform_cli.tui.schemas.create_agent import TUIAgentConfig

                tui_config = TUIAgentConfig.model_validate(data)
                engine_config_dict = tui_config.to_engine_config()
                existing_config["server"] = engine_config_dict["server"]
                existing_config["agent"] = engine_config_dict["agent"]
            elif section == "observability":
                if isinstance(data, ObservabilityConfig):
                    obs_dict = {
                        "provider": data.provider.value,
                        "enabled": data.enabled,
                        "config": data.config.model_dump(by_alias=False),
                    }
                    existing_config["observability"] = [obs_dict]
                else:
                    existing_config["observability"] = [data]
            elif section == "guardrails":
                if isinstance(data, GuardrailsV2):
                    guardrails_dict = {
                        "input": [
                            g.model_dump(by_alias=False, mode="json")
                            for g in data.input
                        ],
                        "output": [
                            g.model_dump(by_alias=False, mode="json")
                            for g in data.output
                        ],
                    }
                    existing_config["guardrails"] = guardrails_dict
                else:
                    existing_config["guardrails"] = data
            elif section == "mcp_servers":
                if isinstance(data, list):
                    mcp_servers_list = []
                    for server in data:
                        if hasattr(server, "model_dump"):
                            mcp_servers_list.append(
                                server.model_dump(
                                    by_alias=True, mode="json", exclude_none=True
                                )
                            )
                        else:
                            mcp_servers_list.append(server)
                    existing_config["mcp_servers"] = mcp_servers_list
                else:
                    existing_config["mcp_servers"] = data
            elif section == "memory":
                from idun_agent_schema.engine.langgraph import CheckpointConfig

                if "agent" not in existing_config:
                    return False, "Agent configuration not found. Save identity first."

                agent_type = existing_config.get("agent", {}).get("type")
                if agent_type != "LANGGRAPH":
                    return (
                        True,
                        "Checkpoint configuration skipped for non-LANGGRAPH agents",
                    )

                if isinstance(data, CheckpointConfig):
                    checkpoint_dict = data.model_dump(by_alias=False, mode="json")

                    if "config" not in existing_config["agent"]:
                        existing_config["agent"]["config"] = {}

                    existing_config["agent"]["config"]["checkpointer"] = checkpoint_dict
                else:
                    return False, "Invalid checkpoint configuration type"
            else:
                existing_config[section] = data

            EngineConfig.model_validate(existing_config)

            with self.agent_path.open("w") as f:
                yaml.dump(existing_config, f, default_flow_style=False)

            return True, "Saved successfully"

        except ValidationError as e:
            return False, f"Validation error: {e}"
        except Exception as e:
            return False, f"Error saving config: {e}"

    def load_config(self, agent_name: str = None) -> dict:
        try:
            if agent_name:
                sanitized_agent_name = self._sanitize_agent_name(agent_name)
                self.agent_path = (self.idun_dir / sanitized_agent_name).with_suffix(
                    ".yaml"
                )

            if self.agent_path is None or not self.agent_path.exists():
                return {}

            with self.agent_path.open("r") as f:
                return yaml.safe_load(f) or {}

        except Exception as e:
            return {}
