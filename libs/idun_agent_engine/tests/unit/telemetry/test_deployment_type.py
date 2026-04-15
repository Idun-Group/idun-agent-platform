"""Tests for deployment_type telemetry detection."""

import pytest

from idun_agent_engine.telemetry.config import get_deployment_type


@pytest.mark.unit
class TestGetDeploymentType:
    """Tests for get_deployment_type()."""

    def test_returns_self_hosted_by_default(self):
        """No env var → self-hosted."""
        assert get_deployment_type({}) == "self-hosted"

    def test_returns_cloud_when_env_is_cloud(self):
        """IDUN_DEPLOYMENT_TYPE=cloud → cloud."""
        assert get_deployment_type({"IDUN_DEPLOYMENT_TYPE": "cloud"}) == "cloud"

    def test_returns_self_hosted_when_env_is_self_hosted(self):
        """IDUN_DEPLOYMENT_TYPE=self-hosted → self-hosted."""
        assert get_deployment_type({"IDUN_DEPLOYMENT_TYPE": "self-hosted"}) == "self-hosted"

    def test_case_insensitive_cloud(self):
        """IDUN_DEPLOYMENT_TYPE is matched case-insensitively."""
        assert get_deployment_type({"IDUN_DEPLOYMENT_TYPE": "CLOUD"}) == "cloud"
        assert get_deployment_type({"IDUN_DEPLOYMENT_TYPE": "Cloud"}) == "cloud"

    def test_unknown_value_falls_back_to_self_hosted(self):
        """Any unrecognised value defaults to self-hosted."""
        assert get_deployment_type({"IDUN_DEPLOYMENT_TYPE": "on-prem"}) == "self-hosted"
        assert get_deployment_type({"IDUN_DEPLOYMENT_TYPE": ""}) == "self-hosted"
        assert get_deployment_type({"IDUN_DEPLOYMENT_TYPE": "   "}) == "self-hosted"

    def test_whitespace_trimmed(self):
        """Leading/trailing whitespace is stripped before comparison."""
        assert get_deployment_type({"IDUN_DEPLOYMENT_TYPE": "  cloud  "}) == "cloud"


@pytest.mark.unit
class TestCommonPropertiesIncludeDeploymentType:
    """Verify that deployment_type flows into telemetry events."""

    def test_common_properties_contain_deployment_type(self, monkeypatch):
        """_common_properties() must include a deployment_type key."""
        monkeypatch.setenv("IDUN_DEPLOYMENT_TYPE", "cloud")

        from idun_agent_engine.telemetry import telemetry as telemetry_module

        props = telemetry_module._common_properties()

        assert "deployment_type" in props
        assert props["deployment_type"] == "cloud"

    def test_common_properties_default_to_self_hosted(self, monkeypatch):
        """Without IDUN_DEPLOYMENT_TYPE, deployment_type is self-hosted."""
        monkeypatch.delenv("IDUN_DEPLOYMENT_TYPE", raising=False)

        from idun_agent_engine.telemetry import telemetry as telemetry_module

        props = telemetry_module._common_properties()

        assert props["deployment_type"] == "self-hosted"
