"""Teams integration — wires the Bot Framework adapter into app state."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx
from botbuilder.integration.aiohttp import (
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
)
from idun_agent_schema.engine.integrations import IntegrationConfig
from idun_agent_schema.engine.integrations.teams import TeamsIntegrationConfig

from ..base import BaseIntegration
from ._idempotency import SeenActivities
from ._settings import TeamsAuthSettings
from .bot import TeamsBot

if TYPE_CHECKING:
    from fastapi import FastAPI

    from ...agent.base import BaseAgent

logger = logging.getLogger(__name__)


class TeamsIntegration(BaseIntegration):
    def __init__(self, config: IntegrationConfig) -> None:
        if not isinstance(config.config, TeamsIntegrationConfig):
            raise TypeError(
                f"Expected TeamsIntegrationConfig, got {type(config.config).__name__}"
            )
        self._teams_config = config.config
        self._http: httpx.AsyncClient | None = None
        self._app: FastAPI | None = None

    async def setup(self, app: FastAPI, agent: BaseAgent) -> None:
        port = app.state.engine_config.server.api.port
        agent_url = f"http://127.0.0.1:{port}"

        adapter_settings = TeamsAuthSettings(self._teams_config)
        adapter = CloudAdapter(ConfigurationBotFrameworkAuthentication(adapter_settings))

        self._http = httpx.AsyncClient()
        bot = TeamsBot(agent_url, self._http, SeenActivities())

        app.state.teams_adapter = adapter
        app.state.teams_bot = bot
        self._app = app
        logger.info("Teams integration configured")

    async def shutdown(self) -> None:
        if self._http:
            await self._http.aclose()
            self._http = None
        if self._app is not None:
            self._app.state.teams_adapter = None
            self._app.state.teams_bot = None
