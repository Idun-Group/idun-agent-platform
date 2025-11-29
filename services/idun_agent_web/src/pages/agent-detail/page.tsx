import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { lazy, Suspense, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/use-auth';
import { Button } from '../../components/general/button/component';
import {
    getAgent,
    patchAgent,
    type BackendAgent,
} from '../../services/agents';
import Loader from '../../components/general/loader/component';
import AgentFormModal from '../../components/agent-form-modal/component';

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
    min-height: calc(100vh - 80px);
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
`;

const Content = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 24px;
`;

const AgentHeader = styled.div`
    padding: 24px 32px;
    margin: 0 24px;
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

const AgentTitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
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
    margin: 0 24px 16px;
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

const ErrorContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 48px 24px;
`;

const ErrorMessage = styled.div`
    text-align: center;
    max-width: 500px;
    
    h2 {
        font-size: 24px;
        font-weight: 600;
        color: #ef4444;
        margin: 0 0 16px 0;
    }
    
    p {
        font-size: 16px;
        color: var(--color-text-secondary, #8892b0);
        margin: 0 0 24px 0;
        line-height: 1.6;
    }
`;

export default function AgentDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [agent, setAgent] = useState<BackendAgent | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const { isLoading: isAuthLoading } = useAuth();

    const loadAgent = () => {
        if (!id) return;
        getAgent(id)
            .then(setAgent)
            .catch((e) => {
                const errorMsg = e instanceof Error ? e.message : 'Failed to load agent';
                setError(errorMsg);
                console.error('Error loading agent:', e);
            });
    };

    useEffect(() => {
        if (!id || isAuthLoading) return;
        loadAgent();
    }, [id, isAuthLoading]);

    const tabs = [
        { id: 'overview', label: "Vue d'ensemble" },
        { id: 'gateway', label: 'API Gateway' },
        { id: 'configuration', label: 'Configuration' },
        { id: 'logs', label: 'Logs' },
    ];

    const getLangfuseUrl = (): string => {
        const maybe = (agent as any)?.run_config?.env?.LANGFUSE_HOST as string | undefined;
        if (maybe && typeof maybe === 'string' && !maybe.includes('${')) return maybe;
        return 'https://cloud.langfuse.com';
    };

    const handleTabClick = (tabId: string) => {
        if (tabId === 'logs') {
            if (typeof window !== 'undefined') {
                const url = getLangfuseUrl();
                window.open(url, '_blank');
            }
            return;
        }
        setActiveTab(tabId);
    };
    
    const getAgentInitials = (): string => {
        if (!agent?.name) return '...';
        
        const words = agent.name.trim().split(/\s+/);
        if (words.length === 1) {
            return words[0].substring(0, 2).toUpperCase();
        }
        
        return words
            .slice(0, 2)
            .map(word => word.charAt(0).toUpperCase())
            .join('');
    };

    const handleEditSuccess = async (payload: any) => {
        if (!agent) return;
        
        setIsSaving(true);
        try {
            const updatedAgent = await patchAgent(agent.id, payload);
            setAgent(updatedAgent);
            setIsEditModalOpen(false);
            toast.success('Agent updated successfully!');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to update agent';
            toast.error(errorMsg);
            throw err;
        } finally {
            setIsSaving(false);
        }
    };

    const renderTabContent = () => (
        <Suspense fallback={<Loader />}>
            {
                {
                    overview: <OverviewTab agent={agent} />,
                    gateway: <GatewayTab agent={agent} />,
                    activity: <ActivityTab />,
                    configuration: <ConfigurationTab agent={agent} />,
                    logs: <LogsTab />,
                }[activeTab]
            }
        </Suspense>
    );

    if (error) {
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
                    <ErrorContainer>
                        <ErrorMessage>
                            <h2>Failed to load agent</h2>
                            <p>{error}</p>
                            <Button 
                                $variants="base" 
                                $color="primary"
                                onClick={() => window.location.reload()}
                            >
                                Retry
                            </Button>
                        </ErrorMessage>
                    </ErrorContainer>
                </Content>
            </PageContainer>
        );
    }

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
                        <Avatar>{getAgentInitials()}</Avatar>
                        <AgentDetails>
                            <AgentTitleRow>
                                <h1>{agent?.name ?? '...'}</h1>
                                <StatusBadge status={(agent?.status || 'draft').toLowerCase()}>
                                    {agent?.status ?? 'draft'}
                                </StatusBadge>
                            </AgentTitleRow>
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
                    </AgentInfo>
                    <Controls>
                        <Button
                            $variants="transparent"
                            $color="secondary"
                            onClick={() => setIsEditModalOpen(true)}
                            disabled={!agent}
                        >
                            Modifier
                        </Button>
                        <Button $variants="transparent" $color="secondary" disabled>
                            Pause
                        </Button>
                        <Button $variants="base" $color="primary" disabled>
                            Exécuter
                        </Button>
                    </Controls>
                </AgentHeader>

                <TabContainer>
                    {tabs.map((tab) => (
                        <Tab
                            key={tab.id}
                            active={activeTab === tab.id}
                            onClick={() => handleTabClick(tab.id)}
                        >
                            {tab.label}
                        </Tab>
                    ))}
                </TabContainer>

                <>{renderTabContent()}</>
            </Content>

            {agent && (
                <AgentFormModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSuccess={handleEditSuccess}
                    mode="edit"
                    initialData={agent}
                />
            )}
        </PageContainer>
    );
}
