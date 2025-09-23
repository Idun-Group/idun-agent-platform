import importlib.util
import logging
import os
import uuid
from typing import Any

os.environ["HAYSTACK_CONTENT_TRACING_ENABLED"] = "true"

from haystack import Pipeline
from haystack.components.agents import Agent
from haystack.dataclasses import ChatMessage
from haystack_integrations.components.connectors.langfuse import LangfuseConnector

from idun_agent_engine.agent.base import BaseAgent
from idun_agent_engine.agent.haystack.haystack_model import HaystackAgentConfig
from idun_agent_engine.agent.haystack.utils import _parse_component_definition

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
        self._agent_instance: Any = None
        self._configuration: HaystackAgentConfig | None = None
        self._name: str = "Haystack Agent"
        self._langfuse_tracing: bool = False
        self._enable_tracing: bool = False
        self._infos: dict[str, Any] = {
            "status": "Uninitialized",
            "name": self._name,
            "id": self._id,
        }
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

    def _check_langfuse_tracing(self, pipeline: Pipeline) -> None:
        """Check if the pipeline has a LangfuseConnector."""
        logger.debug("Searching LangfuseConnector in the pipeline..")
        for name, component in pipeline.walk():
            if isinstance(component, LangfuseConnector):
                logger.info(f"Found LangfuseConnector component with name: {name}")
                self._langfuse_tracing = True

    def _add_langfuse_tracing(self, component: Agent | Pipeline):
        logger.debug("Checking for Langfuse tracing...")
        if isinstance(component, Pipeline):
            if self._langfuse_tracing:
                logger.info("langfuse tracing already on")
            else:
                logger.info("Pipeline has no tracer included. Adding Langfuse tracer")
                component.add_component(
                    f"{self._configuration.name} tracer",
                    instance=LangfuseConnector(self._configuration.name),
                )
                logger.info("Added component tracer")
                self._langfuse_tracing = True
        logger.info("Agent tracing not supported yet")

    async def initialize(self, config: HaystackAgentConfig | dict[str, Any]) -> None:
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

            # check if config has observability `enabled` or `disabled`, so that we adjust our component to
            # either add a tracer or not
            if self._configuration.observability.enabled:
                self._enable_tracing = True
                logger.info("Enabling tracing...")
            component: Agent | Pipeline = self._load_component(
                self._configuration.component_definition
            )
            self._infos["component_type"] = self._configuration.component_type
            self._infos["component_definition"] = (
                self._configuration.component_definition
            )
            self._agent_instance = component
            # TODO: input output schema definition
            self._infos["status"] = "initialized"
            logger.info("Status initialized!")
            self._infos["config_used"] = self._configuration.model_dump()
        except Exception as e:
            logger.error(f"Failed to initialize HaystackAgent: {e}")
            raise

    def _fetch_component_from_module(self) -> Agent | Pipeline:
        """Fetches the variable that holds the component of an Agent/Pipeline.

        Returns: Agent | Pipeline.
        """
        module_path, component_variable_name = _parse_component_definition(
            self._configuration.component_definition
        )
        logger.debug(
            f"Importing spec from file location: {self._configuration.component_definition}"
        )
        try:
            spec = importlib.util.spec_from_file_location(
                component_variable_name, module_path
            )
            if spec is None or spec.loader is None:
                logger.error(f"Could not load spec for module at {module_path}")
                raise ImportError(f"Could not load spec for module at {module_path}")

            module = importlib.util.module_from_spec(spec)
            logger.debug("Execing module..")
            spec.loader.exec_module(module)
            logger.debug("Module executed")

            component_variable = getattr(module, component_variable_name)
            logger.info(f"Found component variable: {component_variable}")

            component = getattr(module, component_variable_name)

            if not isinstance(component, (Pipeline, Agent)):
                raise TypeError(
                    f"The variable '{component_variable_name}' from {module_path} is not a Pipeline or Agent instance. Got {type(component)}"
                )

            return component

        except Exception as e:
            raise ValueError(
                f"Invalid component definition string: {self._configuration.component_definition}. Error: {e}"
            ) from e

    def _load_component(self, component_definition: str) -> Agent | Pipeline:
        """Loads a Haystack component (Agent or Pipeline) from the path (component definition) and returns the agent_instance with langfuse tracing."""
        logger.debug(f"Loading component from: {component_definition}...")

        component = self._fetch_component_from_module()
        if self._enable_tracing:
            try:
                self._add_langfuse_tracing(component)
            except (FileNotFoundError, ImportError, AttributeError) as e:
                raise ValueError(
                    f"Failed to load agent from {component_definition}: {e}"
                ) from e

            return component
        else:
            logger.debug("User wants tracing disabled. Skipping..")
            return component

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
            # if pipeline
            if isinstance(self._agent_instance, Pipeline):
                logger.debug("Running Pipeline instance...")
                raw_result = self._agent_instance.run(data={"query": message["query"]})
                result = raw_result["generator"]["replies"][0]
                logger.info(f"Pipeline answer: {result}")
                return result

            # if agent
            elif isinstance(self._agent_instance, Agent):
                logger.debug("Running Agent instance...")
                raw_result = self._agent_instance.run(
                    # TODO: make run method arguments based on component type
                    messages=[ChatMessage.from_user(message["query"])]
                )  # TODO: from input schema
                logger.info(f"Pipeline answer: {raw_result['messages'][-1].text}")
                result = raw_result["messages"][-1].text
                return result

        # TODO: validates with output schema, and not hardcodded
        except Exception as e:
            raise RuntimeError(f"Pipeline execution failed: {e}") from e

    async def stream(self, message: Any) -> Any:
        pass
