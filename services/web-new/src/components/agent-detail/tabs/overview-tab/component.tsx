import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { notify } from '../../../toast/notify';
import { Save } from 'lucide-react';
import type { BackendAgent } from '../../../../services/agents';
import { fetchApplications } from '../../../../services/applications';
import { fetchSSOs } from '../../../../services/sso';
import { fetchIntegrations } from '../../../../services/integrations';
import { API_BASE_URL } from '../../../../utils/api';
import {
    extractAgentConfig,
    extractSelectionsFromAgent,
    validateAgentForm,
    buildAgentPatchPayload,
    getDefaultSelections,
    type AgentFormState,
    type AgentSelections,
    type AvailableResources,
} from '../../../../utils/agent-config-utils';
import AgentDetailsSection from './sections/agent-details-section';
import FrameworkSection from './sections/framework-section';
import GraphSection from './sections/graph-section';
import ResourcesSection from './sections/resources-section';
import DashboardOverview from './sections/dashboard-overview';
import { ActionBar, ActionButton } from './sections/styled';

interface OverviewTabProps {
    agent: BackendAgent | null;
    isEditing: boolean;
    onSave: (payload: any) => void;
    onCancel: () => void;
    saveTrigger?: number;
    onAgentRefresh?: () => void;
}

const OverviewTab = ({ agent, isEditing, onSave, onCancel, saveTrigger, onAgentRefresh }: OverviewTabProps) => {
    const [formState, setFormState] = useState<AgentFormState>({
        name: '',
        version: '1.0.0',
        baseUrl: '',
        serverPort: '8000',
        agentType: 'LANGGRAPH',
        agentConfig: {},
    });

    const [selections, setSelections] = useState<AgentSelections>(getDefaultSelections());
    const [resources, setResources] = useState<AvailableResources>({
        observabilityApps: [],
        memoryApps: [],
        mcpApps: [],
        guardApps: [],
        ssoConfigs: [],
        integrationConfigs: [],
    });
    const [rootSchema, setRootSchema] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [graphRefreshKey, setGraphRefreshKey] = useState(0);

    useEffect(() => {
        setGraphRefreshKey(k => k + 1);
    }, []);

    useEffect(() => {
        if (!agent) return;
        loadResources();
    }, [agent?.id]);

    const loadResources = async () => {
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
            setResources(newResources);
            return newResources;
        } catch (err) {
            console.error('Failed to load resources:', err);
            return null;
        }
    };

    useEffect(() => {
        if (!isEditing || !agent) return;

        fetch(`${API_BASE_URL}/api/openapi.json`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch schema');
                return res.json();
            })
            .then(setRootSchema)
            .catch(err => console.error('Error fetching OpenAPI schema:', err));

        const initSelections = async () => {
            const freshResources = await loadResources();
            if (freshResources && agent) {
                const extracted = extractSelectionsFromAgent(
                    agent,
                    agent.framework || 'LANGGRAPH',
                    freshResources
                );
                setSelections(extracted);
            }
        };
        initSelections();

        const port = agent.engine_config?.server?.api?.port;
        setFormState({
            name: agent.name || '',
            version: agent.version || '1.0.0',
            baseUrl: agent.base_url || '',
            serverPort: port ? String(port) : '8000',
            agentType: agent.engine_config?.agent?.type || agent.framework || 'LANGGRAPH',
            agentConfig: extractAgentConfig(agent.engine_config),
        });
    }, [isEditing, agent]);

    const handleFieldChange = (field: keyof AgentFormState, value: string) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    const handleConfigChange = (newConfig: Record<string, any>) => {
        setFormState(prev => ({ ...prev, agentConfig: newConfig }));
    };

    const handleSelectionChange = (updated: Partial<AgentSelections>) => {
        setSelections(prev => ({ ...prev, ...updated }));
    };

    const handleSave = async () => {
        const error = validateAgentForm(formState);
        if (error) {
            notify.error(error);
            return;
        }
        setIsSaving(true);
        try {
            const payload = buildAgentPatchPayload(formState, selections);
            await onSave(payload);
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if (saveTrigger && saveTrigger > 0 && isEditing) {
            handleSave();
        }
    }, [saveTrigger]);

    if (!agent) return null;

    return (
        <Container>
            {/* ── View mode: 3-column dashboard ── */}
            {!isEditing && (
                <DashboardOverview
                    agent={agent}
                    resources={resources}
                    refreshKey={graphRefreshKey}
                    onAgentRefresh={onAgentRefresh}
                />
            )}

            {/* ── Edit mode: stacked sections ── */}
            {isEditing && (
                <>
                    <AgentDetailsSection
                        agent={agent}
                        isEditing={isEditing}
                        formState={formState}
                        onFieldChange={handleFieldChange}
                    />
                    <ResourcesSection
                        agent={agent}
                        isEditing={isEditing}
                        resources={resources}
                        selections={selections}
                        onSelectionChange={handleSelectionChange}
                        onResourcesRefresh={setResources}
                        onAgentRefresh={onAgentRefresh}
                    />
                    <GraphSection agent={agent} refreshKey={graphRefreshKey} />
                    <FrameworkSection
                        agent={agent}
                        isEditing={isEditing}
                        agentConfig={formState.agentConfig}
                        rootSchema={rootSchema}
                        onConfigChange={handleConfigChange}
                    />
                </>
            )}

            {isEditing && (
                <ActionBar>
                    <ActionButton onClick={onCancel}>Cancel</ActionButton>
                    <ActionButton $primary onClick={handleSave} disabled={isSaving}>
                        <Save size={16} /> {isSaving ? 'Saving...' : 'Save Changes'}
                    </ActionButton>
                </ActionBar>
            )}
        </Container>
    );
};

export default OverviewTab;

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    padding: 16px 0;
    font-family: 'IBM Plex Sans', sans-serif;
`;
