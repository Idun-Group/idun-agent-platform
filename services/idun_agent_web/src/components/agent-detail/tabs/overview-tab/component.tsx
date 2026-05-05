import { useEffect, useState } from 'react';
import styled from 'styled-components';
import type { BackendAgent } from '../../../../services/agents';
import { fetchApplications } from '../../../../services/applications';
import { fetchSSOs } from '../../../../services/sso';
import { fetchIntegrations } from '../../../../services/integrations';
import {
    extractSelectionsFromAgent,
    getDefaultSelections,
    type AgentSelections,
    type AvailableResources,
} from '../../../../utils/agent-config-utils';
import AgentDetailsSection from './sections/agent-details-section';
import FrameworkSection from './sections/framework-section';
import GraphSection from './sections/graph-section';
import ResourcesSection from './sections/resources-section';
import { TwoColumnGrid, ColumnStack } from './sections/styled';

interface OverviewTabProps {
    agent: BackendAgent | null;
    onAgentRefresh?: () => void;
}

const OverviewTab = ({ agent, onAgentRefresh }: OverviewTabProps) => {
    const [selections, setSelections] = useState<AgentSelections>(getDefaultSelections());
    const [resources, setResources] = useState<AvailableResources>({
        observabilityApps: [],
        memoryApps: [],
        mcpApps: [],
        guardApps: [],
        ssoConfigs: [],
        integrationConfigs: [],
    });
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

    // Extract selections when agent or resources change
    useEffect(() => {
        if (!agent) return;
        const framework = agent.framework || 'LANGGRAPH';
        const extracted = extractSelectionsFromAgent(agent, framework, resources);
        setSelections(extracted);
    }, [agent, resources]);

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

    if (!agent) return null;

    return (
        <Container>
            <TwoColumnGrid>
                <ColumnStack>
                    <GraphSection agent={agent} refreshKey={graphRefreshKey} />

                    <AgentDetailsSection
                        agent={agent}
                        onAgentRefresh={onAgentRefresh}
                    />

                    <FrameworkSection
                        agent={agent}
                        onAgentRefresh={onAgentRefresh}
                    />
                </ColumnStack>

                <ResourcesSection
                    agent={agent}
                    resources={resources}
                    selections={selections}
                    onResourcesRefresh={setResources}
                    onAgentRefresh={onAgentRefresh}
                />
            </TwoColumnGrid>
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
