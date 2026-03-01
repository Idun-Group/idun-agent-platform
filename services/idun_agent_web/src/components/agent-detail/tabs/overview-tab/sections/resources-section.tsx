import { Database, Eye, Server, Shield, KeyRound, Plug } from 'lucide-react';
import type { BackendAgent } from '../../../../../services/agents';
import type { ApplicationConfig } from '../../../../../types/application.types';
import type { AgentSelections, AvailableResources } from '../../../../../utils/agent-config-utils';
import { OBSERVABILITY_PROVIDER_MAP, FRAMEWORK_MEMORY_MAP } from '../../../../../utils/agent-config-utils';
import ResourceCard from './resource-card';
import {
    SectionCard,
    SectionHeader,
    SectionTitle,
    SectionIcon,
    ResourceGrid,
} from './styled';

const VIRTUAL_IN_MEMORY = '__in_memory__';

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

interface ResourcesSectionProps {
    agent: BackendAgent;
    isEditing: boolean;
    resources: AvailableResources;
    selections: AgentSelections;
    onSelectionChange: (updated: Partial<AgentSelections>) => void;
}

export default function ResourcesSection({
    agent,
    isEditing,
    resources,
    selections,
    onSelectionChange,
}: ResourcesSectionProps) {
    const framework = agent.framework || 'LANGGRAPH';

    // Derive assigned names from engine_config for view mode
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

    // Memory: build list with built-in options + framework-compatible app configs
    const availableMemoryTypes = FRAMEWORK_MEMORY_MAP[framework] || [];
    const filteredMemoryApps = resources.memoryApps.filter(app => availableMemoryTypes.includes(app.type));
    const builtinMemoryItems = [
        makeVirtualMemoryApp(VIRTUAL_IN_MEMORY, 'In-Memory', framework === 'ADK' ? 'AdkInMemory' : 'InMemory'),
    ];
    const allMemoryItems = [
        ...builtinMemoryItems.map(app => ({ kind: 'app' as const, data: app })),
        ...filteredMemoryApps.map(app => ({ kind: 'app' as const, data: app })),
    ];

    // Derive the selected ID for the memory card (single-select)
    const getMemorySelectedId = (): string[] => {
        if (selections.selectedMemoryType === 'InMemoryCheckpointConfig' || selections.selectedMemoryType === 'AdkInMemory') {
            return [VIRTUAL_IN_MEMORY];
        }
        if (selections.selectedMemoryAppId) return [selections.selectedMemoryAppId];
        return [VIRTUAL_IN_MEMORY];
    };

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
                />
            </ResourceGrid>
        </SectionCard>
    );
}
