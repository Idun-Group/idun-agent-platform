import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { Button } from '../../components/general/button/component';
import { getAgent, type BackendAgent } from '../../services/agents';
import Loader from '../../components/general/loader/component';
// const CodeTab = lazy(
//     () => import('../../components/agent-detail/tabs/code-tab/component')
// );
const OverviewTab = lazy(
    () => import('../../components/agent-detail/tabs/overview-tab/component')
);
const ActivityTab = lazy(
    () => import('../../components/agent-detail/tabs/activity-tab/component')
);
const ConfigurationTab = lazy(
    () =>
        import('../../components/agent-detail/tabs/configuration-tab/component')
);
const LogsTab = lazy(
    () => import('../../components/agent-detail/tabs/logs-tab/component')
);

const GatewayTab = lazy(
    () => import('../../components/agent-detail/tabs/gateway-tab/component')
);

// Styled Components
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: #0f1016;
    color: white;
    font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
`;

const Header = styled.header`
    padding: 20px 32px;
    border-bottom: 1px solid #1e1e1e;
    display: flex;
    align-items: center;
    gap: 16px;
    background-color: #0f1016;
    z-index: 10;
`;

const Content = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
`;

const AgentHeader = styled.div`
    padding: 24px 32px;
    border-bottom: 1px solid #1e1e1e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #0f1016;
`;

const AgentInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
`;

const Avatar = styled.div`
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #8c52ff 0%, #ff6b9d 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 18px;
    color: white;
`;

const AgentDetails = styled.div`
    h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
        color: white;
    }

    p {
        margin: 4px 0 0 0;
        color: #8e8e93;
        font-size: 14px;
    }
`;

const MetaRow = styled.div`
    display: flex;
    gap: 16px;
    margin-top: 8px;
`;

const MetaItem = styled.span`
    font-size: 12px;
    color: #9ca3af;
`;

const StatusBadge = styled.span<{ status: string }>`
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    background-color: ${(props) =>
        props.status === 'active' ? '#1d4ed8' : '#374151'};
    color: ${(props) => (props.status === 'active' ? '#dbeafe' : '#9ca3af')};
`;

const Controls = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const TabContainer = styled.div`
    display: flex;
    background-color: #0f1016;
    border-bottom: 1px solid #1e1e1e;
    padding: 0 32px;
    margin-bottom: 16px;
`;

const Tab = styled.button<{ active: boolean }>`
    background: none;
    border: none;
    color: ${(props) => (props.active ? '#8c52ff' : '#8e8e93')};
    font-size: 14px;
    font-weight: 500;
    padding: 16px 24px;
    cursor: pointer;
    border-bottom: 2px solid
        ${(props) => (props.active ? '#8c52ff' : 'transparent')};
    transition: all 0.2s ease;

    &:hover {
        color: ${(props) => (props.active ? '#8c52ff' : '#ffffff')};
    }
`;

export default function AgentDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [agent, setAgent] = useState<BackendAgent | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { session, isLoading: isAuthLoading } = useAuth();

    useEffect(() => {
        if (!id || isAuthLoading || !session) return;
        getAgent(id)
            .then(setAgent)
            .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load agent'));
    }, [id, isAuthLoading, session]);

    const tabs = [
        { id: 'overview', label: "Vue d'ensemble" },
        { id: 'gateway', label: 'API Gateway' },
        { id: 'activity', label: 'Activité' },
        { id: 'configuration', label: 'Configuration' },
        { id: 'logs', label: 'Logs' },
        // { id: 'code', label: 'Code' },
    ];

    const renderTabContent = () => (
        <Suspense fallback={<Loader />}>
            {
                {
                    overview: <OverviewTab agent={agent} />,
                    gateway: <GatewayTab agent={agent} />,
                    activity: <ActivityTab />,
                    configuration: <ConfigurationTab agent={agent} />,
                    logs: <LogsTab />,
                    // code: <CodeTab />,
                }[activeTab]
            }
        </Suspense>
    );

    return (
        <PageContainer>
            <Header>
                <Button
                    $variants="transparent"
                    $color="secondary"
                    onClick={() => navigate('/agents')}
                >
                    Retour
                </Button>
            </Header>

            <Content>
                <AgentHeader>
                    <AgentInfo>
                        <Avatar>CS</Avatar>
                        <AgentDetails>
                            <h1>{agent?.name ?? '...'}</h1>
                            {agent?.description ? <p>{agent.description}</p> : null}
                            {agent?.framework ? (
                                <MetaRow>
                                    <MetaItem>
                                        Framework: {agent.framework}
                                    </MetaItem>
                                    {agent?.created_at ? (
                                        <MetaItem>
                                            Created: {new Date(agent.created_at).toLocaleString()}
                                        </MetaItem>
                                    ) : null}
                                    {agent?.updated_at ? (
                                        <MetaItem>
                                            Updated: {new Date(agent.updated_at).toLocaleString()}
                                        </MetaItem>
                                    ) : null}
                                </MetaRow>
                            ) : null}
                        </AgentDetails>
                        <StatusBadge status={(agent?.status || 'draft').toLowerCase()}>
                            {agent?.status ?? 'draft'}
                        </StatusBadge>
                    </AgentInfo>
                    <Controls>
                        <Button $variants="transparent" $color="secondary">
                            Paramètres
                        </Button>
                        <Button $variants="transparent" $color="secondary">
                            Pause
                        </Button>
                        <Button $variants="base" $color="primary">
                            Exécuter
                        </Button>
                    </Controls>
                </AgentHeader>

                <TabContainer>
                    {tabs.map((tab) => (
                        <Tab
                            key={tab.id}
                            active={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </Tab>
                    ))}
                </TabContainer>

                <>{renderTabContent()}</>
            </Content>
        </PageContainer>
    );
}
