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
import { ActionBar, ActionButton, TwoColumnGrid, ColumnStack } from './sections/styled';

interface OverviewTabProps {
    agent: BackendAgent | null;
    isEditing: boolean;
    onSave: (payload: any) => void;
    onCancel: () => void;
    saveTrigger?: number;
    onAgentRefresh?: () => void;
    canWrite?: boolean;
}

const OverviewTab = ({ agent, isEditing, onSave, onCancel, saveTrigger, onAgentRefresh, canWrite = false }: OverviewTabProps) => {
    // Form state (initialized when entering edit mode)
    const [formState, setFormState] = useState<AgentFormState>({
        name: '',
        version: '1.0.0',
        baseUrl: '',
        description: '',
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

    // Refresh graph on every mount (tab switch or page load)
    useEffect(() => {
        setGraphRefreshKey(k => k + 1);
    }, []);

    // Fetch available resources on mount (needed for quick-add in view mode)
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

    // Fetch schema and initialize form when entering edit mode
    useEffect(() => {
        if (!isEditing || !agent) return;

        // Fetch OpenAPI schema
        fetch(`${API_BASE_URL}/api/openapi.json`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch schema');
                return res.json();
            })
            .then(setRootSchema)
            .catch(err => console.error('Error fetching OpenAPI schema:', err));

        // Extract current selections from agent config using current resources
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

        // Initialize form state from agent
        const port = agent.engine_config?.server?.api?.port;
        setFormState({
            name: agent.name || '',
            version: agent.version || '1.0.0',
            baseUrl: agent.base_url || '',
            description: agent.description || '',
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
            <TwoColumnGrid>
                <ColumnStack>
                    <GraphSection agent={agent} refreshKey={graphRefreshKey} />

                    <AgentDetailsSection
                        agent={agent}
                        isEditing={isEditing}
                        formState={formState}
                        onFieldChange={handleFieldChange}
                    />

                    <FrameworkSection
                        agent={agent}
                        isEditing={isEditing}
                        agentConfig={formState.agentConfig}
                        rootSchema={rootSchema}
                        onConfigChange={handleConfigChange}
                    />
                </ColumnStack>

                <ResourcesSection
                    agent={agent}
                    isEditing={isEditing}
                    canWrite={canWrite}
                    resources={resources}
                    selections={selections}
                    onSelectionChange={handleSelectionChange}
                    onResourcesRefresh={setResources}
                    onAgentRefresh={onAgentRefresh}
                />
            </TwoColumnGrid>

            {isEditing && canWrite && (
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
    gap: 24px;
    width: 100%;
    padding: 24px 0;
    overflow-y: auto;
`;
