"""Traefik Gateway integration for dynamic agent route management."""

import json
from typing import Any, Dict, Optional
from uuid import UUID

import httpx

from app.core.logging import get_logger
from app.core.settings import get_settings

logger = get_logger(__name__)


class TraefikGatewayService:
    """Service for managing agent routes in Traefik Gateway."""
    
    def __init__(self) -> None:
        """Initialize the Traefik Gateway service."""
        self.settings = get_settings()
        self.traefik_api_url = "http://traefik:8080/api"  # Default Traefik API endpoint
        
    async def register_agent_route(
        self, 
        agent_id: UUID, 
        agent_endpoint: str,
        agent_name: str,
        tenant_id: UUID
    ) -> bool:
        """Register a new agent route with Traefik.
        
        Args:
            agent_id: The unique identifier of the agent
            agent_endpoint: The internal endpoint where the agent is running
            agent_name: Human-readable name for the agent
            tenant_id: The tenant ID for route isolation
            
        Returns:
            True if route was registered successfully, False otherwise
        """
        logger.info("Registering agent route with Traefik", 
                   agent_id=agent_id, 
                   endpoint=agent_endpoint)
        
        try:
            # Create Traefik configuration for the agent
            route_config = self._create_agent_route_config(
                agent_id, agent_endpoint, agent_name, tenant_id
            )
            
            # Option 1: Use Traefik's File Provider (recommended for dynamic config)
            await self._update_file_provider_config(agent_id, route_config)
            
            # Option 2: Alternative - Use Traefik's HTTP Provider or API
            # await self._update_via_api(agent_id, route_config)
            
            logger.info("Agent route registered successfully", agent_id=agent_id)
            return True
            
        except Exception as e:
            logger.error("Failed to register agent route", 
                        agent_id=agent_id, 
                        error=str(e))
            return False
    
    async def unregister_agent_route(self, agent_id: UUID) -> bool:
        """Remove an agent route from Traefik.
        
        Args:
            agent_id: The unique identifier of the agent
            
        Returns:
            True if route was removed successfully, False otherwise
        """
        logger.info("Unregistering agent route from Traefik", agent_id=agent_id)
        
        try:
            # Remove the route configuration
            await self._remove_file_provider_config(agent_id)
            
            logger.info("Agent route unregistered successfully", agent_id=agent_id)
            return True
            
        except Exception as e:
            logger.error("Failed to unregister agent route", 
                        agent_id=agent_id, 
                        error=str(e))
            return False
    
    async def get_agent_routes(self) -> Dict[str, Any]:
        """Get all currently registered agent routes.
        
        Returns:
            Dictionary of active routes and their configurations
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.traefik_api_url}/http/routers")
                response.raise_for_status()
                
                all_routes = response.json()
                
                # Filter for agent routes (those with our naming convention)
                agent_routes = {
                    name: config for name, config in all_routes.items()
                    if name.startswith("agent-")
                }
                
                return agent_routes
                
        except Exception as e:
            logger.error("Failed to get agent routes", error=str(e))
            return {}
    
    def _create_agent_route_config(
        self, 
        agent_id: UUID, 
        agent_endpoint: str,
        agent_name: str,
        tenant_id: UUID
    ) -> Dict[str, Any]:
        """Create Traefik route configuration for an agent.
        
        Args:
            agent_id: The unique identifier of the agent
            agent_endpoint: The internal endpoint where the agent is running
            agent_name: Human-readable name for the agent
            tenant_id: The tenant ID for route isolation
            
        Returns:
            Traefik configuration dictionary
        """
        service_name = f"agent-{agent_id}"
        router_name = f"agent-{agent_id}-router"
        
        return {
            "http": {
                "routers": {
                    router_name: {
                        "rule": f"Host(`{self.settings.api.cors_origins[0]}`) && PathPrefix(`/api/agents/{agent_id}`)",
                        "service": service_name,
                        "middlewares": ["agent-auth", "agent-cors"],
                        "entryPoints": ["web"]
                    }
                },
                "services": {
                    service_name: {
                        "loadBalancer": {
                            "servers": [
                                {"url": agent_endpoint}
                            ],
                            "healthCheck": {
                                "path": "/health",
                                "interval": "30s",
                                "timeout": "5s"
                            }
                        }
                    }
                },
                "middlewares": {
                    "agent-auth": {
                        "headers": {
                            "customRequestHeaders": {
                                "X-Agent-ID": str(agent_id),
                                "X-Tenant-ID": str(tenant_id),
                                "X-Agent-Name": agent_name
                            }
                        }
                    },
                    "agent-cors": {
                        "headers": {
                            "accessControlAllowMethods": ["GET", "POST", "PUT", "DELETE"],
                            "accessControlAllowOriginList": self.settings.api.cors_origins,
                            "accessControlAllowHeaders": ["*"]
                        }
                    }
                }
            }
        }
    
    async def _update_file_provider_config(
        self, 
        agent_id: UUID, 
        config: Dict[str, Any]
    ) -> None:
        """Update Traefik configuration using file provider.
        
        This assumes Traefik is configured to watch a specific directory
        for dynamic configuration files.
        
        Args:
            agent_id: The unique identifier of the agent
            config: The Traefik configuration to write
        """
        config_path = f"/etc/traefik/dynamic/agent-{agent_id}.yml"
        
        # TODO: In a real implementation, you would:
        # 1. Write the config to the Traefik dynamic config directory
        # 2. Traefik will automatically pick up the changes
        # 3. For K8s, you might use ConfigMaps or CRDs instead
        
        logger.debug("Writing Traefik config to file", 
                    agent_id=agent_id, 
                    config_path=config_path)
        
        # Simulate writing config file
        # In practice: yaml.dump(config, open(config_path, 'w'))
        
    async def _remove_file_provider_config(self, agent_id: UUID) -> None:
        """Remove agent configuration file.
        
        Args:
            agent_id: The unique identifier of the agent
        """
        config_path = f"/etc/traefik/dynamic/agent-{agent_id}.yml"
        
        # TODO: In a real implementation:
        # os.remove(config_path)
        
        logger.debug("Removed Traefik config file", 
                    agent_id=agent_id, 
                    config_path=config_path)
    
    async def _update_via_api(
        self, 
        agent_id: UUID, 
        config: Dict[str, Any]
    ) -> None:
        """Alternative: Update Traefik configuration via API.
        
        This requires Traefik to have API access enabled and
        might be used with the HTTP provider.
        
        Args:
            agent_id: The unique identifier of the agent
            config: The Traefik configuration to apply
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.put(
                    f"{self.traefik_api_url}/http/routers/agent-{agent_id}",
                    json=config
                )
                response.raise_for_status()
                
        except httpx.HTTPError as e:
            logger.error("Failed to update Traefik via API", 
                        agent_id=agent_id, 
                        error=str(e))
            raise


class TraefikConfigurationError(Exception):
    """Exception raised when Traefik configuration fails."""
    pass 