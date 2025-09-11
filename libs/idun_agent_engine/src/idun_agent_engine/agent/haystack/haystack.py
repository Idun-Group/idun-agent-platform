"""Haystack agent adapter implementing the BaseAgent protocol."""

import importlib.util
import logging
import os
import uuid
from typing import Any

os.environ["HAYSTACK_CONTENT_TRACING_ENABLED"] = "true"

from haystack import Pipeline
from haystack_integrations.components.connectors.langfuse import LangfuseConnector

from idun_agent_engine.agent.base import BaseAgent
from idun_agent_engine.agent.haystack.haystack_model import HaystackAgentConfig

logging.basicConfig(
    format="%(asctime)s %(levelname)-8s %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


class HaystackAgent(BaseAgent):
    """Haystack agent adapter implementing the BaseAgent protocol."""

    def __init__(self):
        """Initialize an unconfigured haystack agent with default state."""
        self._id: str = str(uuid.uuid4())
        self._agent_type: str = "haystack"
        self._agent_instance: Any = None  # make enum?
        self._configuration: HaystackAgentConfig | None = None
        self._name: str = "Haystack Agent"
        self._langfuse_tracing: bool = False
        self._infos: dict[str, Any] = {
            "status": "Uninitialized",
            "name": self._name,
            "id": self._id,
        }
        # TODO: obs block
        # TODO: input/output schema
        # TODO: checkpointing/debugging

    @property
    def id(self) -> str:
        """Returns the agent id."""
        return self._id

    @property
    def agent_type(self) -> str:
        """Return agent type label."""
        return self._agent_type

    @property
    def name(self) -> str:
        """Return configured human-readable agent name."""
        return self._name

    @property
    def agent_instance(self) -> Any:
        """Return compiled graph instance.

        Raises:
            RuntimeError: If the agent is not yet initialized.
        """
        if self._agent_instance is None:
            raise RuntimeError("Agent not initialized. Call initialize() first.")
        return self._agent_instance

    @property
    def configuration(self) -> HaystackAgentConfig:
        """Return validated configuration.

        Raises:
            RuntimeError: If the agent has not been configured yet.
        """
        if not self._configuration:
            raise RuntimeError("Agent not configured. Call initialize() first.")
        return self._configuration

    @property
    def infos(self) -> dict[str, Any]:
        """Return diagnostic information about the agent instance."""
        return self._infos

    def _has_langfuse_tracing(self, pipeline: Pipeline) -> bool:
        """Check if any component of the pipeline is a LangfuseConnector."""
        logger.debug("Searching LangfuseConnector in the pipeline..")
        for name, component in pipeline.walk():
            if isinstance(component, LangfuseConnector):
                logger.info(f"Found LangfuseConnector component with name: {name}")
                return True
        return False

    async def initialize(self, config: HaystackAgentConfig | dict[str, Any]) -> None:
        # TODO: obs
        try:
            logger.debug(f"Initializing haystack agent config: {config}...")

            if isinstance(config, HaystackAgentConfig):
                self._configuration = config
                logger.debug("Validated HaystackAgentConfig")
            else:
                logger.warning(f"Validating a dict config: {config}")
                self._configuration = HaystackAgentConfig.model_validate(config)
                logger.debug("Validated dict config")
            self._name = self._configuration.name or "Haystack Agent"
            self._infos["name"] = self._name
            # TODO: await persistence haystack
            # TODO OBS block
            pipeline = self._load_pipeline(self._configuration.component_definition)
            self._infos["component_type"] = self._configuration.component_type
            self._infos["component_definition"] = (
                self._configuration.component_definition
            )
            self._agent_instance = pipeline
            # TODO: input output schema definition
            self._infos["status"] = "initialized"
            logger.info("Status initialized!")
            self._infos["config_used"] = self._configuration.model_dump()
        except Exception as e:
            logger.error(f"Failed to initialize HaystackAgent: {e}")
            raise

    def _load_pipeline(self, pipeline_definition: str) -> Pipeline:
        """Loads a Haystack Pipeline from the path (pipeline definition)."""
        logger.debug(f"Loading pipeline from: {pipeline_definition}...")
        try:
            if ":" not in pipeline_definition:
                logger.error(
                    f"Cannot parse pipeline definition. Pipeline definition in wrong format: {pipeline_definition}"
                )
                raise ValueError(
                    f"pipeline_definition must be in format: 'path/to/my/module.py:pipeline_variable_name"
                    f"got: {pipeline_definition}"
                )
            logger.debug("Pipeline definition format validated")
            module_path, pipeline_variable_name = pipeline_definition.rsplit(":", 1)
            logger.debug(
                f"Extracted variable: {pipeline_variable_name} from module {module_path}"
            )
        except Exception as e:
            logger.error(f"Error parsing pipeline definition: {e}")
            raise ValueError(
                f"Invalid PIpeline Definition format: {pipeline_definition}"
            ) from e

        try:
            logger.debug(f"Importing spec from file location: {module_path}")
            spec = importlib.util.spec_from_file_location(
                pipeline_variable_name, module_path
            )
            if spec is None or spec.loader is None:
                logger.error(f"Could not load spec for module at {module_path}")
                raise ImportError(f"Could not load spec for module at {module_path}")

            module = importlib.util.module_from_spec(spec)
            logger.debug("Execing module..")
            spec.loader.exec_module(module)
            logger.debug("Module executed")

            pipeline = getattr(module, pipeline_variable_name)
            # Check if the pipeline has built in tracer component
            # TODO: make provider agnostic
            # TODO: do we want to force provider? if no provider specified in config/pipeline what to default to? langfuse/arize/otel/w&b...

            if self._has_langfuse_tracing(pipeline):
                logger.info("langfuse tracing already on")
                self._langfuse_tracing = True

            else:
                logger.info(pipeline)
                logger.info("Pipeline has no tracer included. Adding Langfuse tracer")
                pipeline.add_component(
                    "tracer", instance=LangfuseConnector(self._configuration.name)
                )
                logger.info("Added component tracer")
        except (FileNotFoundError, ImportError, AttributeError) as e:
            raise ValueError(
                f"Failed to load agent from {pipeline_definition}: {e}"
            ) from e

        if not isinstance(pipeline, Pipeline):
            raise TypeError(
                f"The variable '{pipeline_variable_name}' from {module_path} is not a pipeline instance."
            )
        return pipeline

    async def invoke(self, message: Any) -> Any:
        """Process a single input to chat with the agent.The message should be a dictionary containing 'query' and 'session_id'."""
        # TODO: validate actual message
        # TODO: validate input schema
        logger.debug(f"Invoking pipeline for message: {message}")
        if self._agent_instance is None:
            raise RuntimeError(
                "Agent not initialized. Call initialize() before processing messages."
            )

        if (
            not isinstance(message, dict)
            or "query" not in message
            or "session_id" not in message
        ):
            raise ValueError(
                "Message must be a dictionary with 'query' and 'session_id' keys."
            )

        try:
            # TODO: support async
            result = self._agent_instance.run(
                data={"query": message["query"]}
            )  # TODO: from input schema
            logger.info(f"Pipeline answer: {result}")
            return result["generator"]["replies"][
                0
            ]  # TODO: validates with output schema, and not hardcodded
        except Exception as e:
            raise RuntimeError(f"Pipeline execution failed: {e}") from e

    async def stream(self, message: Any) -> Any:
        pass
