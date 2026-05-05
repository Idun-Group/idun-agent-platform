"""Adapter object that feeds Bot Framework auth from integration config."""

from __future__ import annotations

from idun_agent_schema.engine.integrations.teams import TeamsIntegrationConfig


class TeamsAuthSettings:
    APP_TYPE = "SingleTenant"

    def __init__(self, config: TeamsIntegrationConfig) -> None:
        self.APP_ID = config.app_id
        self.APP_PASSWORD = config.app_password
        self.APP_TENANTID = config.app_tenant_id
