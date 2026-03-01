import { useState } from 'react';
import { Database, Eye, Server, Shield, KeyRound, Plug, Plus, Check } from 'lucide-react';
import { notify } from '../../../../toast/notify';
import type { BackendAgent } from '../../../../../services/agents';
import { patchAgent } from '../../../../../services/agents';
import type { ApplicationConfig, AppCategory } from '../../../../../types/application.types';
import type { AgentSelections, AvailableResources } from '../../../../../utils/agent-config-utils';
import {
    OBSERVABILITY_PROVIDER_MAP,
    FRAMEWORK_MEMORY_MAP,
    extractSelectionsFromAgent,
    buildAgentPatchPayload,
    extractAgentConfig,
} from '../../../../../utils/agent-config-utils';
import { fetchApplications } from '../../../../../services/applications';
import { fetchSSOs } from '../../../../../services/sso';
import { fetchIntegrations } from '../../../../../services/integrations';
import CreateObservabilityModal from '../../../../applications/create-observability-modal/component';
import CreateMcpModal from '../../../../applications/create-mcp-modal/component';
import CreateGuardrailModal from '../../../../applications/create-guardrail-modal/component';
import { CreateMemoryModal } from '../../../../applications/create-memory-modal/component';
import CreateSsoModal from '../../../../applications/create-sso-modal/component';
import CreateIntegrationModal from '../../../../applications/create-integration-modal/component';
import type { ManagedSSO } from '../../../../../services/sso';
import type { ManagedIntegration } from '../../../../../services/integrations';
import ResourceCard from './resource-card';
import type { AssignedResourceDetail, ConfigEntry } from './resource-card';
import {
    SectionCard,
    SectionHeader,
    SectionTitle,
    SectionIcon,
    ResourceGrid,
} from './styled';

const VIRTUAL_IN_MEMORY = '__in_memory__';

function truncate(s: string, max: number): string {
    return s.length > max ? s.substring(0, max) + '...' : s;
}

function maskValue(s: string): string {
    if (s.length <= 8) return '••••••';
    return s.substring(0, 4) + '••••' + s.substring(s.length - 4);
}

function makeVirtualMemoryApp(id: string, name: string, type: string): ApplicationConfig {
    return {
        id,
        name,
        type: type as ApplicationConfig['type'],
        category: 'Memory',
        owner: '',
        createdAt: '',
        updatedAt: '',
        config: {},
    };
}

type ResourceCategory = AppCategory | 'SSO' | 'Integrations';

type CreateTarget =
    | { category: 'Observability' }
    | { category: 'Memory' }
    | { category: 'MCP' }
    | { category: 'Guardrails' }
    | { category: 'SSO' }
    | { category: 'Integrations' };

interface ResourcesSectionProps {
    agent: BackendAgent;
    isEditing: boolean;
    resources: AvailableResources;
    selections: AgentSelections;
    onSelectionChange: (updated: Partial<AgentSelections>) => void;
    onResourcesRefresh?: (resources: AvailableResources) => void;
    onAgentRefresh?: () => void;
}

export default function ResourcesSection({
    agent,
    isEditing,
    resources,
    selections,
    onSelectionChange,
    onResourcesRefresh,
    onAgentRefresh,
}: ResourcesSectionProps) {
    const framework = agent.framework || 'LANGGRAPH';

    const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [quickAddCategory, setQuickAddCategory] = useState<ResourceCategory | null>(null);

    // ── Assigned names (existing logic) ──

    const getMemoryAssigned = (): string[] => {
        const config = agent.engine_config?.agent?.config as any;
        if (!config) return ['In-Memory'];
        if (framework === 'ADK') {
            const ss = config.session_service;
            if (!ss || ss.type === 'in_memory') return ['In-Memory'];
            if (ss.type === 'vertex_ai') return ['Vertex AI'];
            if (ss.type === 'database') return ['Database'];
            return ['In-Memory'];
        }
        const cp = config.checkpointer;
        if (!cp || cp.type === 'memory') return ['In-Memory'];
        if (cp.type === 'sqlite') return ['SQLite'];
        if (cp.type === 'postgres') return ['PostgreSQL'];
        return [cp.type];
    };

    const getObservabilityAssigned = (): string[] => {
        const obs = (agent.engine_config as any)?.observability;
        if (!Array.isArray(obs)) return [];
        return obs
            .filter((o: any) => o.provider && o.enabled !== false)
            .map((o: any) => OBSERVABILITY_PROVIDER_MAP[o.provider] || o.provider);
    };

    const getMCPAssigned = (): string[] => {
        const ec = agent.engine_config as any;
        const mcp = ec?.mcp_servers || ec?.mcpServers;
        if (!Array.isArray(mcp)) return [];
        return mcp.map((m: any) => m.name).filter(Boolean);
    };

    const getGuardrailsAssigned = (): string[] => {
        const guards = (agent.engine_config as any)?.guardrails;
        if (!guards?.input || !Array.isArray(guards.input)) return [];
        return guards.input.map((g: any) => g.name || g.config_id).filter(Boolean);
    };

    const getSSOAssigned = (): string[] => {
        const sso = (agent.engine_config as any)?.sso;
        if (!sso) return [];
        return [sso.issuer || 'SSO'];
    };

    const getIntegrationsAssigned = (): string[] => {
        const ints = (agent.engine_config as any)?.integrations;
        if (!Array.isArray(ints)) return [];
        return ints.map((i: any) => i.provider).filter(Boolean);
    };

    // ── Assigned details (new: rich view-mode data) ──

    const getMemoryDetails = (): AssignedResourceDetail[] => {
        const config = agent.engine_config?.agent?.config as any;
        if (!config) return [{ name: 'In-Memory', type: 'InMemory', detail: 'Default in-memory storage', linkTo: '/memory' }];
        if (framework === 'ADK') {
            const ss = config.session_service;
            if (!ss || ss.type === 'in_memory') return [{ name: 'In-Memory', type: 'InMemory', detail: 'Default in-memory storage', linkTo: '/memory' }];
            if (ss.type === 'vertex_ai') {
                const entries: ConfigEntry[] = [];
                if (ss.project_id) entries.push({ key: 'Project', value: ss.project_id });
                if (ss.location) entries.push({ key: 'Location', value: ss.location });
                return [{ name: 'Vertex AI', type: 'AdkVertexAi', detail: ss.project_id ? `${ss.project_id} / ${ss.location || ''}` : '', badge: 'Vertex AI', linkTo: '/memory', configEntries: entries }];
            }
            if (ss.type === 'database') {
                const entries: ConfigEntry[] = [];
                if (ss.connection_string) entries.push({ key: 'Connection', value: truncate(ss.connection_string, 60) });
                return [{ name: 'Database', type: 'AdkDatabase', detail: ss.connection_string ? truncate(ss.connection_string, 40) : '', badge: 'Database', linkTo: '/memory', configEntries: entries }];
            }
            return [{ name: 'In-Memory', type: 'InMemory', detail: 'Default in-memory storage', linkTo: '/memory' }];
        }
        const cp = config.checkpointer;
        if (!cp || cp.type === 'memory') return [{ name: 'In-Memory', type: 'InMemory', detail: 'Default in-memory storage', linkTo: '/memory' }];
        if (cp.type === 'sqlite') {
            const connStr = cp.db_url || cp.connection_string || '';
            const entries: ConfigEntry[] = [];
            if (connStr) entries.push({ key: 'Connection', value: connStr });
            return [{ name: 'SQLite', type: 'SQLite', detail: connStr || 'Local SQLite', badge: 'SQLite', linkTo: '/memory', configEntries: entries }];
        }
        if (cp.type === 'postgres') {
            const connStr = cp.db_url || cp.connection_string || '';
            const entries: ConfigEntry[] = [];
            if (connStr) entries.push({ key: 'Connection', value: truncate(connStr, 60) });
            return [{ name: 'PostgreSQL', type: 'PostgreSQL', detail: connStr ? truncate(connStr, 40) : '', badge: 'PostgreSQL', linkTo: '/memory', configEntries: entries }];
        }
        return [{ name: cp.type, type: cp.type, detail: '', linkTo: '/memory' }];
    };

    const getObservabilityDetails = (): AssignedResourceDetail[] => {
        const obs = (agent.engine_config as any)?.observability;
        if (!Array.isArray(obs)) return [];
        return obs
            .filter((o: any) => o.provider && o.enabled !== false)
            .map((o: any) => {
                const name = OBSERVABILITY_PROVIDER_MAP[o.provider] || o.provider;
                // Config is nested under o.config in frontend camelCase format
                const cfg = o.config || {};
                const entries: ConfigEntry[] = [];

                // Support both camelCase (frontend) and snake_case (backend) field names
                const host = cfg.host || cfg.collector_endpoint;
                const projectName = cfg.projectName || cfg.project_name;
                const endpoint = cfg.endpoint;
                const apiKey = cfg.apiKey || cfg.api_key;
                const publicKey = cfg.publicKey || cfg.public_key;
                const gcpProjectId = cfg.gcpProjectId || cfg.project_id;
                const region = cfg.region;

                if (host) entries.push({ key: 'Host', value: host });
                if (projectName) entries.push({ key: 'Project', value: projectName });
                if (endpoint) entries.push({ key: 'Endpoint', value: endpoint });
                if (publicKey) entries.push({ key: 'Public Key', value: maskValue(publicKey) });
                if (apiKey) entries.push({ key: 'API Key', value: maskValue(apiKey) });
                if (gcpProjectId) entries.push({ key: 'GCP Project', value: gcpProjectId });
                if (region) entries.push({ key: 'Region', value: region });

                const detail = host || projectName || endpoint || gcpProjectId || '';
                return { name, type: name, detail, badge: name, linkTo: '/observability', configEntries: entries };
            });
    };

    const getMCPDetails = (): AssignedResourceDetail[] => {
        const ec = agent.engine_config as any;
        const mcp = ec?.mcp_servers || ec?.mcpServers;
        if (!Array.isArray(mcp)) return [];
        return mcp.map((m: any) => {
            const transport = m.transport || (m.command ? 'stdio' : 'http');
            const detail = transport === 'stdio' ? `${m.command || ''}` : `${m.url || ''}`;
            const entries: ConfigEntry[] = [];
            entries.push({ key: 'Transport', value: transport });
            if (m.command) entries.push({ key: 'Command', value: m.command });
            if (m.args?.length) entries.push({ key: 'Args', value: m.args.join(' ') });
            if (m.url) entries.push({ key: 'URL', value: m.url });
            if (m.env && Object.keys(m.env).length > 0) entries.push({ key: 'Env vars', value: Object.keys(m.env).join(', ') });
            return { name: m.name || 'MCP Server', type: 'MCPServer', detail, badge: transport.toUpperCase(), linkTo: '/mcp', configEntries: entries };
        });
    };

    const getGuardrailsDetails = (): AssignedResourceDetail[] => {
        const guards = (agent.engine_config as any)?.guardrails;
        if (!guards?.input || !Array.isArray(guards.input)) return [];
        return guards.input.map((g: any) => {
            const configId = g.config_id || '';
            const name = g.name || configId.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Guardrail';
            const entries: ConfigEntry[] = [];
            if (configId) entries.push({ key: 'Type', value: configId });
            if (g.threshold != null) entries.push({ key: 'Threshold', value: String(g.threshold) });
            if (g.on_fail) entries.push({ key: 'On Fail', value: g.on_fail });
            if (g.topics?.length) entries.push({ key: 'Topics', value: g.topics.join(', ') });
            if (g.banned_words?.length) entries.push({ key: 'Banned Words', value: `${g.banned_words.length} words` });
            if (g.competitors?.length) entries.push({ key: 'Competitors', value: g.competitors.join(', ') });
            if (g.project_id) entries.push({ key: 'GCP Project', value: g.project_id });
            if (g.template_id) entries.push({ key: 'Template', value: g.template_id });
            const detail = g.threshold != null ? `Threshold: ${g.threshold}` : configId;
            return { name, type: configId, detail, linkTo: '/guardrails', configEntries: entries };
        });
    };

    const getSSODetails = (): AssignedResourceDetail[] => {
        const sso = (agent.engine_config as any)?.sso;
        if (!sso) return [];
        const entries: ConfigEntry[] = [];
        if (sso.issuer) entries.push({ key: 'Issuer', value: sso.issuer });
        if (sso.audience) entries.push({ key: 'Audience', value: sso.audience });
        if (sso.jwks_uri) entries.push({ key: 'JWKS URI', value: sso.jwks_uri });
        return [{ name: 'SSO', type: 'OIDC', detail: sso.issuer || '', badge: 'OIDC', configEntries: entries }];
    };

    const getIntegrationsDetails = (): AssignedResourceDetail[] => {
        const ints = (agent.engine_config as any)?.integrations;
        if (!Array.isArray(ints)) return [];
        return ints.map((i: any) => {
            const entries: ConfigEntry[] = [];
            if (i.provider) entries.push({ key: 'Provider', value: i.provider });
            if (i.base_url) entries.push({ key: 'URL', value: i.base_url });
            return {
                name: i.provider || 'Integration',
                type: i.provider || 'Integration',
                detail: '',
                configEntries: entries,
            };
        });
    };

    // ── Memory items for edit mode ──

    const availableMemoryTypes = FRAMEWORK_MEMORY_MAP[framework] || [];
    const filteredMemoryApps = resources.memoryApps.filter(app => availableMemoryTypes.includes(app.type));
    const builtinMemoryItems = [
        makeVirtualMemoryApp(VIRTUAL_IN_MEMORY, 'In-Memory', framework === 'ADK' ? 'AdkInMemory' : 'InMemory'),
    ];
    const allMemoryItems = [
        ...builtinMemoryItems.map(app => ({ kind: 'app' as const, data: app })),
        ...filteredMemoryApps.map(app => ({ kind: 'app' as const, data: app })),
    ];

    const getMemorySelectedId = (): string[] => {
        if (selections.selectedMemoryType === 'InMemoryCheckpointConfig' || selections.selectedMemoryType === 'AdkInMemory') {
            return [VIRTUAL_IN_MEMORY];
        }
        if (selections.selectedMemoryAppId) return [selections.selectedMemoryAppId];
        return [VIRTUAL_IN_MEMORY];
    };

    // ── Toggle handlers (edit mode) ──

    const handleMemoryToggle = (id: string) => {
        if (id === VIRTUAL_IN_MEMORY) {
            const inMemType = framework === 'ADK' ? 'AdkInMemory' : 'InMemoryCheckpointConfig';
            onSelectionChange({ selectedMemoryType: inMemType, selectedMemoryAppId: '' });
        } else {
            const app = filteredMemoryApps.find(a => a.id === id);
            if (app) {
                onSelectionChange({ selectedMemoryType: app.type, selectedMemoryAppId: id });
            }
        }
    };

    const handleObsToggle = (id: string) => {
        const app = resources.observabilityApps.find(a => a.id === id);
        if (!app) return;
        const type = app.type;
        const isCurrentlySelected = selections.selectedObservabilityTypes.includes(type) &&
            selections.selectedObservabilityApps[type] === id;

        if (isCurrentlySelected) {
            const newTypes = selections.selectedObservabilityTypes.filter(t => t !== type);
            const newApps = { ...selections.selectedObservabilityApps };
            delete newApps[type];
            onSelectionChange({
                selectedObservabilityTypes: newTypes,
                selectedObservabilityApps: newApps,
            });
        } else {
            const newTypes = selections.selectedObservabilityTypes.includes(type)
                ? selections.selectedObservabilityTypes
                : [...selections.selectedObservabilityTypes, type];
            onSelectionChange({
                selectedObservabilityTypes: newTypes,
                selectedObservabilityApps: { ...selections.selectedObservabilityApps, [type]: id },
            });
        }
    };

    const handleMCPToggle = (id: string) => {
        const ids = selections.selectedMCPIds.includes(id)
            ? selections.selectedMCPIds.filter(i => i !== id)
            : [...selections.selectedMCPIds, id];
        onSelectionChange({ selectedMCPIds: ids });
    };

    const handleGuardToggle = (id: string) => {
        const ids = selections.selectedGuardIds.includes(id)
            ? selections.selectedGuardIds.filter(i => i !== id)
            : [...selections.selectedGuardIds, id];
        onSelectionChange({ selectedGuardIds: ids });
    };

    const handleSSOToggle = (id: string) => {
        onSelectionChange({
            selectedSSOId: selections.selectedSSOId === id ? '' : id,
        });
    };

    const handleIntegrationToggle = (id: string) => {
        const ids = selections.selectedIntegrationIds.includes(id)
            ? selections.selectedIntegrationIds.filter(i => i !== id)
            : [...selections.selectedIntegrationIds, id];
        onSelectionChange({ selectedIntegrationIds: ids });
    };

    const obsSelectedIds = Object.values(selections.selectedObservabilityApps);

    // ── Quick-add / manage flow (view mode): multi-select picker ──

    const [isQuickAddPickerOpen, setIsQuickAddPickerOpen] = useState(false);
    const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
    const [isSavingPicker, setIsSavingPicker] = useState(false);

    const isMultiSelectCategory = (cat: ResourceCategory): boolean =>
        cat === 'MCP' || cat === 'Guardrails' || cat === 'Observability' || cat === 'Integrations';

    const getExistingConfigsForCategory = (category: AppCategory): ApplicationConfig[] => {
        switch (category) {
            case 'Observability': return resources.observabilityApps;
            case 'Memory': return resources.memoryApps.filter(app => availableMemoryTypes.includes(app.type));
            case 'MCP': return resources.mcpApps;
            case 'Guardrails': return resources.guardApps;
            default: return [];
        }
    };

    /** Get currently-assigned resource IDs for a category */
    const getAssignedIdsForCategory = (category: ResourceCategory): string[] => {
        const currentSelections = extractSelectionsFromAgent(agent.engine_config, framework, resources);
        switch (category) {
            case 'Observability': return Object.values(currentSelections.selectedObservabilityApps);
            case 'MCP': return currentSelections.selectedMCPIds;
            case 'Guardrails': return currentSelections.selectedGuardIds;
            case 'Integrations': return currentSelections.selectedIntegrationIds;
            case 'SSO': return currentSelections.selectedSSOId ? [currentSelections.selectedSSOId] : [];
            case 'Memory': return currentSelections.selectedMemoryAppId ? [currentSelections.selectedMemoryAppId] : [];
            default: return [];
        }
    };

    const handleQuickAdd = (category: ResourceCategory) => {
        setQuickAddCategory(category);
        setCreateTarget({ category });
        // Pre-select currently assigned items
        setPickerSelectedIds(getAssignedIdsForCategory(category));
        setIsQuickAddPickerOpen(true);
    };

    const handlePickerToggle = (id: string) => {
        setPickerSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    /** Save the multi-select picker selection */
    const handlePickerSave = async () => {
        const category = quickAddCategory;
        if (!category || !agent) return;
        setIsSavingPicker(true);
        try {
            const currentSelections = extractSelectionsFromAgent(agent.engine_config, framework, resources);

            switch (category) {
                case 'Observability': {
                    // Rebuild obs selection from picker IDs
                    const newTypes: string[] = [];
                    const newApps: Record<string, string> = {};
                    for (const id of pickerSelectedIds) {
                        const app = resources.observabilityApps.find(a => a.id === id);
                        if (app) {
                            if (!newTypes.includes(app.type)) newTypes.push(app.type);
                            newApps[app.type] = id;
                        }
                    }
                    currentSelections.selectedObservabilityTypes = newTypes;
                    currentSelections.selectedObservabilityApps = newApps;
                    break;
                }
                case 'MCP':
                    currentSelections.selectedMCPIds = [...pickerSelectedIds];
                    break;
                case 'Guardrails':
                    currentSelections.selectedGuardIds = [...pickerSelectedIds];
                    break;
                case 'Integrations':
                    currentSelections.selectedIntegrationIds = [...pickerSelectedIds];
                    break;
            }

            const port = agent.engine_config?.server?.api?.port;
            const formState = {
                name: agent.name || '', version: agent.version || '1.0.0',
                baseUrl: agent.base_url || '', description: agent.description || '',
                serverPort: port ? String(port) : '8000',
                agentType: agent.engine_config?.agent?.type || framework,
                agentConfig: extractAgentConfig(agent.engine_config),
            };
            const payload = buildAgentPatchPayload(formState, currentSelections, resources);
            await patchAgent(agent.id, payload);
            notify.success('Resources updated');
            onAgentRefresh?.();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : 'Failed to update resources');
        } finally {
            setIsSavingPicker(false);
            setIsQuickAddPickerOpen(false);
            setQuickAddCategory(null);
            setCreateTarget(null);
        }
    };

    /** Single-select: click to assign one item (Memory, SSO) */
    const handlePickerSelectSingle = async (id: string, name: string) => {
        const category = quickAddCategory;
        if (!category || !agent) return;
        setIsQuickAddPickerOpen(false);
        try {
            const currentSelections = extractSelectionsFromAgent(agent.engine_config, framework, resources);

            if (category === 'Memory') {
                const app = resources.memoryApps.find(a => a.id === id);
                if (app) {
                    currentSelections.selectedMemoryType = app.type;
                    currentSelections.selectedMemoryAppId = id;
                }
            } else if (category === 'SSO') {
                currentSelections.selectedSSOId = id;
            }

            const port = agent.engine_config?.server?.api?.port;
            const formState = {
                name: agent.name || '', version: agent.version || '1.0.0',
                baseUrl: agent.base_url || '', description: agent.description || '',
                serverPort: port ? String(port) : '8000',
                agentType: agent.engine_config?.agent?.type || framework,
                agentConfig: extractAgentConfig(agent.engine_config),
            };
            const payload = buildAgentPatchPayload(formState, currentSelections, resources);
            await patchAgent(agent.id, payload);
            notify.success(`${name} assigned to agent`);
            onAgentRefresh?.();
        } catch (err) {
            notify.error(err instanceof Error ? err.message : 'Failed to assign resource');
        } finally {
            setQuickAddCategory(null);
            setCreateTarget(null);
        }
    };

    const handleQuickAddCreateNew = () => {
        setIsQuickAddPickerOpen(false);
        setIsCreateModalOpen(true);
    };

    // ── "Create new" flow (edit mode) ──

    const openCreatePicker = (category: AppCategory) => {
        setCreateTarget({ category });
        setIsCreateModalOpen(true);
    };

    const handleCreateSuccess = async () => {
        setIsCreateModalOpen(false);
        const wasQuickAdd = quickAddCategory !== null;
        setCreateTarget(null);
        setQuickAddCategory(null);

        if (!onResourcesRefresh) return;
        try {
            const [apps, ssos, integrations] = await Promise.all([
                fetchApplications(),
                fetchSSOs().catch(() => []),
                fetchIntegrations().catch(() => []),
            ]);
            const newResources: AvailableResources = {
                observabilityApps: apps.filter(a => a.category === 'Observability'),
                memoryApps: apps.filter(a => a.category === 'Memory'),
                mcpApps: apps.filter(a => a.category === 'MCP'),
                guardApps: apps.filter(a => a.category === 'Guardrails'),
                ssoConfigs: ssos,
                integrationConfigs: integrations,
            };
            onResourcesRefresh(newResources);

            // If this was a quick-add (view mode), refresh agent
            if (wasQuickAdd && onAgentRefresh) {
                onAgentRefresh();
            }
        } catch {
            // toast is handled by the modal
        }
    };

    const handleCreateModalClose = () => {
        setIsCreateModalOpen(false);
        setCreateTarget(null);
        setQuickAddCategory(null);
    };

    /** Extract key config fields for inline preview on picker cards */
    const getConfigPreview = (app: ApplicationConfig): { key: string; value: string }[] => {
        const cfg = app.config || {};
        const entries: { key: string; value: string }[] = [];
        const MAX = 3;

        switch (app.type) {
            case 'Langfuse':
                if (cfg.host) entries.push({ key: 'Host', value: cfg.host });
                if (cfg.publicKey) entries.push({ key: 'Public Key', value: maskValue(cfg.publicKey) });
                break;
            case 'Phoenix':
                if (cfg.host) entries.push({ key: 'Host', value: cfg.host });
                break;
            case 'LangSmith':
                if (cfg.projectName) entries.push({ key: 'Project', value: cfg.projectName });
                if (cfg.endpoint) entries.push({ key: 'Endpoint', value: cfg.endpoint });
                break;
            case 'GoogleCloudLogging':
            case 'GoogleCloudTrace':
                if (cfg.gcpProjectId) entries.push({ key: 'GCP Project', value: cfg.gcpProjectId });
                break;
            case 'PostgreSQL':
            case 'SQLite':
            case 'AdkDatabase':
                if (cfg.connectionString) entries.push({ key: 'Connection', value: truncate(cfg.connectionString, 40) });
                break;
            case 'AdkVertexAi':
                if (cfg.project_id) entries.push({ key: 'Project', value: cfg.project_id });
                if (cfg.location) entries.push({ key: 'Location', value: cfg.location });
                break;
            case 'MCPServer':
                if (cfg.transport) entries.push({ key: 'Transport', value: cfg.transport });
                if (cfg.transport === 'stdio' && cfg.command) entries.push({ key: 'Command', value: cfg.command });
                if (cfg.url) entries.push({ key: 'URL', value: truncate(cfg.url, 50) });
                break;
            default:
                // Show first few string config values
                Object.entries(cfg).slice(0, MAX).forEach(([k, v]) => {
                    if (typeof v === 'string' && v) entries.push({ key: k, value: truncate(v, 40) });
                });
        }

        return entries.slice(0, MAX);
    };

    const hasAssignedForCategory = (category: ResourceCategory): boolean => {
        switch (category) {
            case 'Memory': return getMemoryAssigned().length > 0 && getMemoryAssigned()[0] !== 'In-Memory';
            case 'Observability': return getObservabilityAssigned().length > 0;
            case 'MCP': return getMCPAssigned().length > 0;
            case 'Guardrails': return getGuardrailsAssigned().length > 0;
            case 'SSO': return getSSOAssigned().length > 0;
            case 'Integrations': return getIntegrationsAssigned().length > 0;
            default: return false;
        }
    };

    const quickAddExistingConfigs = quickAddCategory && quickAddCategory !== 'SSO' && quickAddCategory !== 'Integrations'
        ? getExistingConfigsForCategory(quickAddCategory)
        : [];
    const quickAddSSOConfigs = quickAddCategory === 'SSO' ? resources.ssoConfigs : [];
    const quickAddIntegrationConfigs = quickAddCategory === 'Integrations' ? resources.integrationConfigs : [];
    const hasExistingItems = quickAddExistingConfigs.length > 0 || quickAddSSOConfigs.length > 0 || quickAddIntegrationConfigs.length > 0;

    return (
        <SectionCard>
            <SectionHeader>
                <SectionIcon $color="green"><Server size={16} /></SectionIcon>
                <SectionTitle>Resources & Integrations</SectionTitle>
            </SectionHeader>

            <ResourceGrid>
                <ResourceCard
                    icon={<Database size={14} color="#60a5fa" />}
                    title="Memory"
                    items={allMemoryItems}
                    selectedIds={getMemorySelectedId()}
                    isEditing={isEditing}
                    multiSelect={false}
                    onToggle={handleMemoryToggle}
                    assignedNames={getMemoryAssigned()}
                    assignedDetails={getMemoryDetails()}
                    onCreateNew={isEditing ? () => openCreatePicker('Memory') : undefined}
                    onQuickAdd={!isEditing ? () => handleQuickAdd('Memory') : undefined}
                    onManage={!isEditing ? () => handleQuickAdd('Memory') : undefined}
                />

                <ResourceCard
                    icon={<Eye size={14} color="#34d399" />}
                    title="Observability"
                    items={resources.observabilityApps.map(app => ({ kind: 'app' as const, data: app }))}
                    selectedIds={obsSelectedIds}
                    isEditing={isEditing}
                    multiSelect={true}
                    onToggle={handleObsToggle}
                    assignedNames={getObservabilityAssigned()}
                    assignedDetails={getObservabilityDetails()}
                    onCreateNew={isEditing ? () => openCreatePicker('Observability') : undefined}
                    onQuickAdd={!isEditing ? () => handleQuickAdd('Observability') : undefined}
                    onManage={!isEditing ? () => handleQuickAdd('Observability') : undefined}
                />

                <ResourceCard
                    icon={<Server size={14} color="#a78bfa" />}
                    title="MCP Servers"
                    items={resources.mcpApps.map(app => ({ kind: 'app' as const, data: app }))}
                    selectedIds={selections.selectedMCPIds}
                    isEditing={isEditing}
                    multiSelect={true}
                    onToggle={handleMCPToggle}
                    assignedNames={getMCPAssigned()}
                    assignedDetails={getMCPDetails()}
                    onCreateNew={isEditing ? () => openCreatePicker('MCP') : undefined}
                    onQuickAdd={!isEditing ? () => handleQuickAdd('MCP') : undefined}
                    onManage={!isEditing ? () => handleQuickAdd('MCP') : undefined}
                />

                <ResourceCard
                    icon={<Shield size={14} color="#fbbf24" />}
                    title="Guardrails"
                    items={resources.guardApps.map(app => ({ kind: 'app' as const, data: app }))}
                    selectedIds={selections.selectedGuardIds}
                    isEditing={isEditing}
                    multiSelect={true}
                    onToggle={handleGuardToggle}
                    assignedNames={getGuardrailsAssigned()}
                    assignedDetails={getGuardrailsDetails()}
                    onCreateNew={isEditing ? () => openCreatePicker('Guardrails') : undefined}
                    onQuickAdd={!isEditing ? () => handleQuickAdd('Guardrails') : undefined}
                    onManage={!isEditing ? () => handleQuickAdd('Guardrails') : undefined}
                />

                <ResourceCard
                    icon={<KeyRound size={14} color="#f472b6" />}
                    title="SSO"
                    items={resources.ssoConfigs.map(sso => ({ kind: 'sso' as const, data: sso }))}
                    selectedIds={selections.selectedSSOId ? [selections.selectedSSOId] : []}
                    isEditing={isEditing}
                    multiSelect={false}
                    onToggle={handleSSOToggle}
                    assignedNames={getSSOAssigned()}
                    assignedDetails={getSSODetails()}
                    onCreateNew={isEditing ? () => { setCreateTarget({ category: 'SSO' }); setIsCreateModalOpen(true); } : undefined}
                    onQuickAdd={!isEditing ? () => handleQuickAdd('SSO') : undefined}
                    onManage={!isEditing ? () => handleQuickAdd('SSO') : undefined}
                />

                <ResourceCard
                    icon={<Plug size={14} color="#fb923c" />}
                    title="Integrations"
                    items={resources.integrationConfigs.map(int => ({ kind: 'integration' as const, data: int }))}
                    selectedIds={selections.selectedIntegrationIds}
                    isEditing={isEditing}
                    multiSelect={true}
                    onToggle={handleIntegrationToggle}
                    assignedNames={getIntegrationsAssigned()}
                    assignedDetails={getIntegrationsDetails()}
                    onCreateNew={isEditing ? () => { setCreateTarget({ category: 'Integrations' }); setIsCreateModalOpen(true); } : undefined}
                    onQuickAdd={!isEditing ? () => handleQuickAdd('Integrations') : undefined}
                    onManage={!isEditing ? () => handleQuickAdd('Integrations') : undefined}
                />
            </ResourceGrid>

            {/* Quick-add / manage picker */}
            {isQuickAddPickerOpen && quickAddCategory && (() => {
                const isMulti = isMultiSelectCategory(quickAddCategory);
                return (
                    <PickerOverlay onClick={() => { setIsQuickAddPickerOpen(false); setQuickAddCategory(null); setCreateTarget(null); }}>
                        <PickerPanel onClick={e => e.stopPropagation()}>
                            <PickerTitle>
                                {hasAssignedForCategory(quickAddCategory) ? 'Manage' : 'Add'} {quickAddCategory.toLowerCase()}
                            </PickerTitle>

                            {/* App-based configs (Memory, Observability, MCP, Guardrails) */}
                            {quickAddExistingConfigs.length > 0 && (
                                <>
                                    <PickerSectionLabel>{isMulti ? 'Select resources' : 'Select existing'}</PickerSectionLabel>
                                    <ExistingConfigList>
                                        {quickAddExistingConfigs.map(app => {
                                            const configPreview = getConfigPreview(app);
                                            const isChecked = pickerSelectedIds.includes(app.id);
                                            return (
                                                <ExistingConfigCard
                                                    key={app.id}
                                                    $selected={isChecked}
                                                    onClick={() => isMulti
                                                        ? handlePickerToggle(app.id)
                                                        : handlePickerSelectSingle(app.id, app.name)
                                                    }
                                                >
                                                    {isMulti && (
                                                        <PickerCheck $checked={isChecked}>
                                                            {isChecked && <Check size={12} color="white" />}
                                                        </PickerCheck>
                                                    )}
                                                    <ExistingConfigInfo>
                                                        <PickerCardName>{app.name}</PickerCardName>
                                                        <PickerCardDesc>{app.type}</PickerCardDesc>
                                                        {configPreview.length > 0 && (
                                                            <ConfigPreviewList>
                                                                {configPreview.map(({ key, value }) => (
                                                                    <ConfigPreviewRow key={key}>
                                                                        <ConfigPreviewKey>{key}</ConfigPreviewKey>
                                                                        <ConfigPreviewValue>{value}</ConfigPreviewValue>
                                                                    </ConfigPreviewRow>
                                                                ))}
                                                            </ConfigPreviewList>
                                                        )}
                                                    </ExistingConfigInfo>
                                                    <ExistingConfigBadge>{app.type}</ExistingConfigBadge>
                                                </ExistingConfigCard>
                                            );
                                        })}
                                    </ExistingConfigList>
                                </>
                            )}

                            {/* SSO configs (single-select) */}
                            {quickAddSSOConfigs.length > 0 && (
                                <>
                                    <PickerSectionLabel>Select existing</PickerSectionLabel>
                                    <ExistingConfigList>
                                        {quickAddSSOConfigs.map(sso => {
                                            const isActive = pickerSelectedIds.includes(sso.id);
                                            return (
                                                <ExistingConfigCard key={sso.id} $selected={isActive} onClick={() => handlePickerSelectSingle(sso.id, sso.name)}>
                                                    <ExistingConfigInfo>
                                                        <PickerCardName>{sso.name}</PickerCardName>
                                                        <PickerCardDesc>{sso.sso?.issuer || 'SSO'}</PickerCardDesc>
                                                    </ExistingConfigInfo>
                                                    <ExistingConfigBadge>OIDC</ExistingConfigBadge>
                                                </ExistingConfigCard>
                                            );
                                        })}
                                    </ExistingConfigList>
                                </>
                            )}

                            {/* Integration configs (multi-select) */}
                            {quickAddIntegrationConfigs.length > 0 && (
                                <>
                                    <PickerSectionLabel>Select resources</PickerSectionLabel>
                                    <ExistingConfigList>
                                        {quickAddIntegrationConfigs.map(int => {
                                            const isChecked = pickerSelectedIds.includes(int.id);
                                            return (
                                                <ExistingConfigCard key={int.id} $selected={isChecked} onClick={() => handlePickerToggle(int.id)}>
                                                    <PickerCheck $checked={isChecked}>
                                                        {isChecked && <Check size={12} color="white" />}
                                                    </PickerCheck>
                                                    <ExistingConfigInfo>
                                                        <PickerCardName>{int.name}</PickerCardName>
                                                        <PickerCardDesc>{int.integration?.provider || 'Integration'}</PickerCardDesc>
                                                    </ExistingConfigInfo>
                                                    <ExistingConfigBadge>{int.integration?.provider || 'Integration'}</ExistingConfigBadge>
                                                </ExistingConfigCard>
                                            );
                                        })}
                                    </ExistingConfigList>
                                </>
                            )}

                            {hasExistingItems && <PickerDivider />}

                            <CreateNewPickerButton type="button" onClick={handleQuickAddCreateNew}>
                                <Plus size={14} />
                                {hasExistingItems ? 'Or create new' : 'Create new'} {quickAddCategory?.toLowerCase()}
                            </CreateNewPickerButton>

                            {/* Save button for multi-select categories */}
                            {isMulti && hasExistingItems && (
                                <PickerSaveButton type="button" onClick={handlePickerSave} disabled={isSavingPicker}>
                                    {isSavingPicker ? 'Saving...' : 'Save'}
                                </PickerSaveButton>
                            )}
                        </PickerPanel>
                    </PickerOverlay>
                );
            })()}

            {/* Category-specific create modals */}
            <CreateObservabilityModal
                isOpen={isCreateModalOpen && createTarget?.category === 'Observability'}
                onClose={handleCreateModalClose}
                onCreated={handleCreateSuccess}
            />
            <CreateMcpModal
                isOpen={isCreateModalOpen && createTarget?.category === 'MCP'}
                onClose={handleCreateModalClose}
                onCreated={handleCreateSuccess}
            />
            <CreateGuardrailModal
                isOpen={isCreateModalOpen && createTarget?.category === 'Guardrails'}
                onClose={handleCreateModalClose}
                onCreated={handleCreateSuccess}
            />
            <CreateMemoryModal
                isOpen={isCreateModalOpen && createTarget?.category === 'Memory'}
                onClose={handleCreateModalClose}
                onSaved={handleCreateSuccess}
                initialFramework={framework}
            />
            <CreateSsoModal
                isOpen={isCreateModalOpen && createTarget?.category === 'SSO'}
                onClose={handleCreateModalClose}
                onCreated={handleCreateSuccess}
            />
            <CreateIntegrationModal
                isOpen={isCreateModalOpen && createTarget?.category === 'Integrations'}
                onClose={handleCreateModalClose}
                onCreated={handleCreateSuccess}
            />
        </SectionCard>
    );
}

// Inline styled for the picker overlay (avoid bloating shared styled.ts)
import styled from 'styled-components';

const PickerOverlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
`;

const PickerPanel = styled.div`
    background: #1a1a2e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
    max-width: 520px;
    width: 90%;
    max-height: 70vh;
    overflow-y: auto;
`;

const PickerTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: #e5e7eb;
    margin: 0 0 16px;
`;

const PickerCardName = styled.span`
    font-weight: 600;
    font-size: 13px;
`;

const PickerCardDesc = styled.span`
    font-size: 11px;
    color: #6b7280;
`;

const PickerSectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    margin-bottom: 8px;
`;

const PickerDivider = styled.div`
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 16px 0;
`;

const ExistingConfigList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const ExistingConfigCard = styled.button<{ $selected?: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid ${p => p.$selected ? 'rgba(140, 82, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)'};
    background: ${p => p.$selected ? 'rgba(140, 82, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)'};
    color: #e5e7eb;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: all 0.15s;

    &:hover {
        border-color: ${p => p.$selected ? 'rgba(140, 82, 255, 0.5)' : 'rgba(16, 185, 129, 0.4)'};
        background: ${p => p.$selected ? 'rgba(140, 82, 255, 0.12)' : 'rgba(16, 185, 129, 0.06)'};
    }
`;

const PickerCheck = styled.div<{ $checked?: boolean }>`
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1.5px solid ${p => p.$checked ? '#8c52ff' : 'rgba(255,255,255,0.15)'};
    background: ${p => p.$checked ? '#8c52ff' : 'transparent'};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
    transition: all 0.15s;
`;

const PickerSaveButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 20px;
    border-radius: 8px;
    background: #8c52ff;
    color: white;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    margin-top: 12px;
    transition: background 0.2s;

    &:hover { background: #7c3aed; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ExistingConfigInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
`;

const ExistingConfigBadge = styled.span`
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(16, 185, 129, 0.1);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.15);
    white-space: nowrap;
    flex-shrink: 0;
`;

const ConfigPreviewList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.04);
`;

const ConfigPreviewRow = styled.div`
    display: flex;
    gap: 8px;
    font-size: 10px;
    line-height: 1.4;
`;

const ConfigPreviewKey = styled.span`
    color: #6b7280;
    flex-shrink: 0;
    font-weight: 500;
`;

const ConfigPreviewValue = styled.span`
    color: #9ca3af;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 10px;
`;

const CreateNewPickerButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px dashed rgba(140, 82, 255, 0.3);
    background: transparent;
    color: #a78bfa;
    cursor: pointer;
    width: 100%;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.15s;
    margin-top: 8px;

    &:hover {
        border-color: rgba(140, 82, 255, 0.5);
        background: rgba(140, 82, 255, 0.04);
    }
`;
