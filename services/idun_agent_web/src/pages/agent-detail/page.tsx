import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { lazy, Suspense, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/use-auth';
import {
    getAgent,
    patchAgent,
    restartAgent,
    type BackendAgent,
} from '../../services/agents';
import Loader from '../../components/general/loader/component';
import AgentFormModal from '../../components/agent-form-modal/component';
import { AgentAvatar } from '../../components/general/agent-avatar/component';
import {
    ArrowLeft,
    RotateCcw,
    Edit3,
    LayoutDashboard,
    Webhook,
    Settings,
    Activity,
    Layers
} from 'lucide-react';

const OverviewTab = lazy(() => import('../../components/agent-detail/tabs/overview-tab/component'));
const GatewayTab = lazy(() => import('../../components/agent-detail/tabs/gateway-tab/component'));
const ConfigurationTab = lazy(() => import('../../components/agent-detail/tabs/configuration-tab/component'));
const ActivityTab = lazy(() => import('../../components/agent-detail/tabs/activity-tab/component'));
const LogsTab = lazy(() => import('../../components/agent-detail/tabs/logs-tab/component'));

const TABS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'gateway', label: 'API Integration', icon: Webhook },
    { id: 'configuration', label: 'Configuration', icon: Settings },
    { id: 'logs', label: 'Logs', icon: Activity } // Added Logs as it was in original but maybe not in target design tabs list, keeping for functionality
];

export default function AgentDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [agent, setAgent] = useState<BackendAgent | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

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

    const getLangfuseUrl = (): string => {
        const maybe = (agent as any)?.run_config?.env?.LANGFUSE_HOST as string | undefined;
        if (maybe && typeof maybe === 'string' && !maybe.includes('${')) return maybe;
        return 'https://cloud.langfuse.com';
    };

    const handleTabClick = (tabId: string) => {
        if (tabId === 'logs') {
            // For logs, we might want to open external link or show tab.
            // Original code opened external link. Let's keep it if that's the intention,
            // OR show the LogsTab. The new design doesn't explicitly show Logs tab in TABS list but I'll keep it.
            // If we want to replicate the target exactly, maybe we should hide it or move it.
            // Let's show the tab for now as it exists in components.
            setActiveTab(tabId);
            return;
        }
        setActiveTab(tabId);
    };

    const handleEditSuccess = async (payload: any) => {
        if (!agent) return;
        try {
            const updatedAgent = await patchAgent(agent.id, payload);
            setAgent(updatedAgent);
            setIsEditModalOpen(false);
            toast.success('Agent updated successfully!');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to update agent';
            toast.error(errorMsg);
        }
    };

    const handleRestart = async () => {
        if (!agent?.base_url) {
            toast.error('Agent URL is not available');
            return;
        }
        try {
            await restartAgent(agent.base_url);
            toast.success('Agent restart triggered successfully');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to restart agent';
            toast.error(errorMsg);
        }
    };

    const statusColor = (agent?.status || 'draft').toLowerCase() === 'active' ? 'emerald' : 'gray';

    if (error) {
        return (
            <PageContainer>
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <h2 style={{ color: '#ef4444', marginBottom: '16px' }}>Failed to load agent</h2>
                    <p style={{ color: '#9ca3af', marginBottom: '24px' }}>{error}</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </PageContainer>
        );
    }

    if (!agent && !error) return <Loader />;

    return (
        <PageContainer>
            <TopNav>
                <BackButton onClick={() => navigate('/agents')}>
                    <ArrowLeft size={14} style={{ marginRight: '6px' }} /> Back to Agents
                </BackButton>
            </TopNav>

            <HeaderSection>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <AvatarContainer>
                        <AgentAvatar name={agent?.name || 'Agent'} size={80} />
                        <StatusDot $status={agent?.status || 'draft'} />
                    </AvatarContainer>

                    <div>
                        <Title>{agent?.name}</Title>
                        <MetaInfo>
                            <StatusBadge $status={agent?.status || 'draft'}>
                                {agent?.status || 'DRAFT'}
                            </StatusBadge>
                            <Separator>•</Separator>
                            <MetaText>ID: {agent?.id}</MetaText>
                            <Separator>•</Separator>
                            <MetaText style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Layers size={12} color="#8c52ff" /> {agent?.framework || 'LANGGRAPH'}
                            </MetaText>
                        </MetaInfo>
                    </div>
                </div>

                <Actions>
                    <HeaderButton onClick={handleRestart}>
                        <RotateCcw size={16} /> Restart
                    </HeaderButton>
                    <HeaderButton $primary onClick={() => setIsEditModalOpen(true)}>
                        <Edit3 size={16} /> Edit Agent
                    </HeaderButton>
                </Actions>
            </HeaderSection>

            <TabsNav>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <TabButton
                            key={tab.id}
                            $active={isActive}
                            onClick={() => handleTabClick(tab.id)}
                        >
                            <Icon size={16} style={{ marginRight: '8px' }} />
                            {tab.label}
                        </TabButton>
                    );
                })}
            </TabsNav>

            <ContentArea>
                <Suspense fallback={<Loader />}>
                    {activeTab === 'overview' && <OverviewTab agent={agent} />}
                    {activeTab === 'gateway' && <GatewayTab agent={agent} />}
                    {activeTab === 'configuration' && <ConfigurationTab agent={agent} />}
                    {activeTab === 'logs' && <LogsTab />}
                </Suspense>
            </ContentArea>

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

// Styled Components
const PageContainer = styled.div`
    min-height: 100vh;
    color: white;
    padding: 24px 40px;
    display: flex;
    flex-direction: column;
    /* Ensure the background covers the entire scrollable area */
    height: fit-content;
    width: 100%;
`;

const TopNav = styled.div`
    margin-bottom: 24px;
`;

const BackButton = styled.button`
    display: flex;
    align-items: center;
    background: none;
    border: none;
    color: #6b7280;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    &:hover { color: white; }
`;

const HeaderSection = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
    flex-wrap: wrap;
    gap: 24px;
`;

const AvatarContainer = styled.div`
    position: relative;
`;

const StatusDot = styled.div<{ $status: string }>`
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 4px solid #0f1016;
    background-color: ${props => props.$status.toLowerCase() === 'active' ? '#10b981' : '#ef4444'}; // Emerald or Red (or Gray for draft)
    ${props => props.$status.toLowerCase() === 'draft' && 'background-color: #6b7280;'}
`;

const Title = styled.h1`
    font-size: 32px;
    font-weight: 700;
    color: white;
    margin: 0 0 8px 0;
    letter-spacing: -0.02em;
`;

const MetaInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
`;

const StatusBadge = styled.span<{ $status: string }>`
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    ${props => {
        const s = props.$status.toLowerCase();
        if (s === 'active') return 'background-color: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2);';
        if (s === 'draft') return 'background-color: rgba(107, 114, 128, 0.1); color: #9ca3af; border: 1px solid rgba(107, 114, 128, 0.2);';
        return 'background-color: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2);';
    }}
`;

const Separator = styled.span`
    color: #4b5563;
`;

const MetaText = styled.span`
    color: #9ca3af;
    font-size: 12px;
    font-family: monospace;
`;

const Actions = styled.div`
    display: flex;
    gap: 12px;
`;

const HeaderButton = styled.button<{ $primary?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    ${props => props.$primary
        ? `
            background-color: #8c52ff;
            color: white;
            border: none;
            box-shadow: 0 0 15px rgba(140, 82, 255, 0.3);
            &:hover { background-color: #7c3aed; box-shadow: 0 0 20px rgba(140, 82, 255, 0.5); }
        `
        : `
            background-color: rgba(255, 255, 255, 0.05);
            color: #d1d5db;
            border: 1px solid rgba(255, 255, 255, 0.1);
            &:hover { background-color: rgba(255, 255, 255, 0.1); color: white; }
        `
    }
`;

const TabsNav = styled.div`
    display: flex;
    gap: 32px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    margin-bottom: 32px;
`;

const TabButton = styled.button<{ $active: boolean }>`
    display: flex;
    align-items: center;
    background: none;
    border: none;
    padding: 16px 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    position: relative;
    transition: all 0.2s;

    ${props => props.$active
        ? `color: white;`
        : `color: #9ca3af; &:hover { color: #d1d5db; }`
    }

    &::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        right: 0;
        height: 2px;
        background-color: #8c52ff;
        opacity: ${props => props.$active ? 1 : 0};
        transition: opacity 0.2s;
    }

    svg {
        color: ${props => props.$active ? '#8c52ff' : 'currentColor'};
        transition: color 0.2s;
    }

    &:hover svg {
        color: ${props => props.$active ? '#8c52ff' : '#d1d5db'};
    }
`;

const ContentArea = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
`;

const Button = styled.button`
    padding: 8px 16px;
    background-color: #8c52ff;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
`;
