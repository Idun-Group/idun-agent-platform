# Idun Platform API Specification

Based on the user stories analysis, here's the complete API specification for the Idun Agent Manager backend.

## 🎯 API Domains

### 1. **Agents Management** (`/api/v1/agents/`)

**Core CRUD Operations:**
- `GET /api/v1/agents/` - List all user's agents
- `POST /api/v1/agents/` - Create new agent (US 01)
- `GET /api/v1/agents/{id}` - Get specific agent details
- `PUT /api/v1/agents/{id}` - Update agent (US 09)
- `DELETE /api/v1/agents/{id}` - Delete agent (US 09)

**Agent Operations:**
- `POST /api/v1/agents/{id}/deploy` - Deploy agent (US 01.1, US 01.2)
- `POST /api/v1/agents/{id}/stop` - Stop agent (US 09)
- `GET /api/v1/agents/{id}/logs` - Get agent logs
- `POST /api/v1/agents/{id}/test` - Test agent (US 03)
- `POST /api/v1/agents/{id}/call` - Call agent for external apps (US 10)
- `GET /api/v1/agents/{id}/uri` - Get agent URI for external calls (US 10)

**Import Methods (US 01):**
- `POST /api/v1/agents/import/file` - Import via file upload
- `POST /api/v1/agents/import/github` - Import from GitHub
- `POST /api/v1/agents/import/remote` - Import from remote URL
- `POST /api/v1/agents/import/template` - Import from template
- `POST /api/v1/agents/import/flowise` - Import from Flowise (US 15)
- `POST /api/v1/agents/import/n8n` - Import from N8N (US 15)

### 2. **Deployments** (`/api/v1/deployments/`)

- `GET /api/v1/deployments/` - List all deployments
- `POST /api/v1/deployments/` - Create new deployment
- `GET /api/v1/deployments/{id}` - Get deployment details
- `POST /api/v1/deployments/{id}/rollback` - Rollback deployment (US 16)
- `GET /api/v1/deployments/{id}/status` - Get deployment status
- `DELETE /api/v1/deployments/{id}` - Delete deployment

**Environment-specific:**
- `GET /api/v1/deployments/local` - List local deployments (US 01.1)
- `GET /api/v1/deployments/cloud` - List cloud deployments (US 01.2)

### 3. **Monitoring** (`/api/v1/monitoring/`)

**Agent Monitoring (US 02):**
- `GET /api/v1/monitoring/agents/{id}/metrics` - Get agent metrics
- `GET /api/v1/monitoring/agents/{id}/health` - Get agent health status
- `GET /api/v1/monitoring/agents/{id}/langfuse` - Access Langfuse data
- `GET /api/v1/monitoring/agents/{id}/errors` - Get detailed errors (US 13)

**System Monitoring:**
- `GET /api/v1/monitoring/system/status` - System health status
- `GET /api/v1/monitoring/system/resources` - System resource usage

### 4. **Authentication** (`/api/v1/auth/`)

**Core Auth (US 08):**
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/register` - User registration
- `GET /api/v1/auth/me` - Get current user info

**OAuth Integration:**
- `GET /api/v1/auth/oauth/{provider}` - OAuth login (Google, GitHub, etc.)
- `POST /api/v1/auth/oauth/{provider}/callback` - OAuth callback

### 5. **Users Management** (`/api/v1/users/`)

**User Profile:**
- `GET /api/v1/users/profile` - Get user profile
- `PUT /api/v1/users/profile` - Update user profile
- `GET /api/v1/users/permissions` - Get user permissions (US 06)
- `GET /api/v1/users/usage` - Get usage statistics

**User Administration (US 06):**
- `GET /api/v1/users/` - List all users (admin only)
- `POST /api/v1/users/` - Create user (admin only)
- `PUT /api/v1/users/{id}` - Update user (admin only)
- `DELETE /api/v1/users/{id}` - Delete user (admin only)
- `PUT /api/v1/users/{id}/permissions` - Update user permissions (admin only)

### 6. **Groups Management** (`/api/v1/groups/`)

**Group CRUD (US 07):**
- `GET /api/v1/groups/` - List all groups
- `POST /api/v1/groups/` - Create group
- `GET /api/v1/groups/{id}` - Get group details
- `PUT /api/v1/groups/{id}` - Update group
- `DELETE /api/v1/groups/{id}` - Delete group

**Group Members:**
- `GET /api/v1/groups/{id}/members` - List group members
- `POST /api/v1/groups/{id}/members` - Add member to group
- `DELETE /api/v1/groups/{id}/members/{user_id}` - Remove member from group

### 7. **MCP (Model Context Protocol)** (`/api/v1/mcp/`)

**MCP Management (US 04):**
- `GET /api/v1/mcp/tools` - List available MCP tools
- `POST /api/v1/mcp/tools` - Add new MCP tool
- `GET /api/v1/mcp/tools/{id}` - Get MCP tool details
- `PUT /api/v1/mcp/tools/{id}` - Update MCP tool
- `DELETE /api/v1/mcp/tools/{id}` - Delete MCP tool

**Agent MCP Integration:**
- `GET /api/v1/agents/{id}/mcp` - Get agent's MCP tools
- `POST /api/v1/agents/{id}/mcp` - Add MCP tool to agent
- `DELETE /api/v1/agents/{id}/mcp/{tool_id}` - Remove MCP tool from agent

### 8. **A2A (Agent-to-Agent)** (`/api/v1/a2a/`)

**A2A Management (US 05):**
- `GET /api/v1/a2a/collaborations` - List agent collaborations
- `POST /api/v1/a2a/collaborations` - Create agent collaboration
- `GET /api/v1/a2a/collaborations/{id}` - Get collaboration details
- `PUT /api/v1/a2a/collaborations/{id}` - Update collaboration
- `DELETE /api/v1/a2a/collaborations/{id}` - Delete collaboration

**Communication:**
- `POST /api/v1/a2a/agents/{id}/message` - Send message between agents
- `GET /api/v1/a2a/agents/{id}/conversations` - Get agent conversations

### 9. **Templates** (`/api/v1/templates/`)

**Template Management:**
- `GET /api/v1/templates/` - List available templates
- `POST /api/v1/templates/` - Create new template
- `GET /api/v1/templates/{id}` - Get template details
- `PUT /api/v1/templates/{id}` - Update template
- `DELETE /api/v1/templates/{id}` - Delete template

**Template Categories:**
- `GET /api/v1/templates/categories` - List template categories
- `GET /api/v1/templates/categories/{category}` - Get templates by category

### 10. **Registry/Artifacts** (`/api/v1/registry/`)

**Artifact Registry (US 16):**
- `GET /api/v1/registry/images` - List all images/artifacts
- `GET /api/v1/registry/images/{id}` - Get image details
- `GET /api/v1/registry/images/{id}/history` - Get image history
- `POST /api/v1/registry/images/{id}/rollback` - Rollback to previous version

**Deployment History:**
- `GET /api/v1/registry/deployments/{id}/history` - Get deployment history
- `GET /api/v1/registry/deployments/{id}/versions` - List all versions

### 11. **Documentation** (`/api/v1/docs/`)

**Documentation Access (US 11):**
- `GET /api/v1/docs/` - Get documentation index
- `GET /api/v1/docs/{section}` - Get specific documentation section
- `GET /api/v1/docs/examples` - Get code examples
- `GET /api/v1/docs/tutorials` - Get tutorials

### 12. **Engine Management** (`/api/v1/engine/`)

**Engine Installation & Management (US 14):**
- `GET /api/v1/engine/status` - Get engine status
- `POST /api/v1/engine/install` - Install engine
- `PUT /api/v1/engine/update` - Update engine
- `GET /api/v1/engine/config` - Get engine configuration
- `PUT /api/v1/engine/config` - Update engine configuration

### 13. **Frontend Deployment** (`/api/v1/frontend/`) - Enterprise

**Frontend Management (US 12):**
- `GET /api/v1/frontend/deployments` - List frontend deployments
- `POST /api/v1/frontend/deployments` - Deploy frontend
- `GET /api/v1/frontend/deployments/{id}` - Get frontend deployment
- `DELETE /api/v1/frontend/deployments/{id}` - Delete frontend deployment

## 🔐 Authentication & Authorization

**Headers:**
- `Authorization: Bearer <token>` - Required for all authenticated endpoints
- `X-Tenant-ID: <tenant_id>` - Multi-tenant support

**Roles:**
- `user` - Basic user permissions
- `developer` - Can create and manage agents
- `admin` - Full platform administration
- `enterprise` - Access to enterprise features (US 12, US 13)

## 📊 Response Formats

**Success Response:**
```json
{
  "success": true,
  "data": {...},
  "meta": {
    "pagination": {...},
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

**Error Response (RFC 9457):**
```json
{
  "type": "https://api.idun.com/problems/agent-not-found",
  "title": "Agent Not Found",
  "status": 404,
  "detail": "The requested agent could not be found",
  "instance": "/api/v1/agents/123"
}
```

## 🚀 Implementation Priority

**Phase 1 (MVP):**
1. Agents CRUD + basic deployment
2. Authentication & Users
3. Basic monitoring

**Phase 2:**
1. Templates & Import methods
2. MCP integration
3. Groups & Permissions

**Phase 3:**
1. A2A collaboration
2. Registry & Artifacts
3. Advanced monitoring

**Phase 4 (Enterprise):**
1. Frontend deployment
2. Advanced error analysis
3. Enterprise features
