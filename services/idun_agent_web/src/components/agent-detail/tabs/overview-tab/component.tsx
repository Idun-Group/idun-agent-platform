import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { toast } from 'react-toastify';
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
import ResourcesSection from './sections/resources-section';
import { ActionBar, ActionButton, TwoColumnGrid, ColumnStack } from './sections/styled';

interface OverviewTabProps {
    agent: BackendAgent | null;
    isEditing: boolean;
    onSave: (payload: any) => void;
    onCancel: () => void;
}

const OverviewTab = ({ agent, isEditing, onSave, onCancel }: OverviewTabProps) => {
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

    // Fetch available resources and schema when entering edit mode
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

        // Fetch all available resources
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

                // Extract current selections from agent config, now that we have resources
                const extracted = extractSelectionsFromAgent(
                    agent.engine_config,
                    agent.framework || 'LANGGRAPH',
                    newResources
                );
                setSelections(extracted);
            } catch (err) {
                console.error('Failed to load resources:', err);
            }
        };

        loadResources();

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
            toast.error(error);
            return;
        }

        setIsSaving(true);
        try {
            const payload = buildAgentPatchPayload(formState, selections, resources);
            await onSave(payload);
        } finally {
            setIsSaving(false);
        }
    };

    if (!agent) return null;

    return (
        <Container>
            <TwoColumnGrid>
                <ColumnStack>
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
                    resources={resources}
                    selections={selections}
                    onSelectionChange={handleSelectionChange}
                />
            </TwoColumnGrid>

            {isEditing && (
                <ActionBar>
                    <ActionButton onClick={onCancel}>Cancel</ActionButton>
                    <ActionButton $primary onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
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
