import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { lazy, Suspense, useEffect, useState } from 'react';
import { notify } from '../../components/toast/notify';
import { useAuth } from '../../hooks/use-auth';
import {
    getAgent,
    patchAgent,
    restartAgent,
    performHealthCheck,
    fetchEngineHealth,
    fetchLatestEngineVersion,
    type BackendAgent,
} from '../../services/agents';
import Loader from '../../components/general/loader/component';
import { AgentAvatar } from '../../components/general/agent-avatar/component';
import EnrollmentSection from '../../components/agent-detail/tabs/overview-tab/sections/enrollment-section';
import { useProject } from '../../hooks/use-project';
import {
    ArrowLeft,
    RotateCcw,
    Edit3,
    X,
    Save,
    LayoutDashboard,
    Webhook,
    Settings,
    Layers,
    MessageSquare,
    AlertTriangle,
    CheckCircle2,
} from 'lucide-react';

const OverviewTab = lazy(() => import('../../components/agent-detail/tabs/overview-tab/component'));
const GatewayTab = lazy(() => import('../../components/agent-detail/tabs/gateway-tab/component'));
const ConfigurationTab = lazy(() => import('../../components/agent-detail/tabs/configuration-tab/component'));
const ChatTab = lazy(() => import('../../components/agent-detail/tabs/chat-tab/component'));

const TABS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'gateway', label: 'API Integration', icon: Webhook },
    { id: 'configuration', label: 'Configuration', icon: Settings },
];

export default function AgentDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedProjectId } = useProject();
    const [activeTab, setActiveTab] = useState('overview');
    const [agent, setAgent] = useState<BackendAgent | null>(null);
    const [engineVersion, setEngineVersion] = useState<string | null>(null);
    const [latestEngineVersion, setLatestEngineVersion] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saveTrigger, setSaveTrigger] = useState(0);

    const { isLoading: isAuthLoading } = useAuth();

    const loadAgent = () => {
        if (!id || !selectedProjectId) return;
        getAgent(selectedProjectId, id)
            .then((loaded) => {
                setAgent(loaded);
                performHealthCheck(selectedProjectId, loaded, setAgent);
                if (loaded.base_url) {
                    fetchEngineHealth(loaded.base_url).then(health => {
                        if (health?.engineVersion) setEngineVersion(health.engineVersion);
                    });
                }
                fetchLatestEngineVersion().then(v => setLatestEngineVersion(v));
            })
            .catch((e) => {
                const errorMsg = e instanceof Error ? e.message : 'Failed to load agent';
                setError(errorMsg);
                console.error('Error loading agent:', e);
            });
    };

    useEffect(() => {
        if (!id || isAuthLoading || !selectedProjectId) return;
        loadAgent();
    }, [id, isAuthLoading, selectedProjectId]);

    const handleTabClick = (tabId: string) => {
        if (isEditing && tabId !== 'overview') return;
        setActiveTab(tabId);
    };

    const handleEditSave = async (payload: any) => {
        if (!agent || !selectedProjectId) return;
        try {
            const updatedAgent = await patchAgent(selectedProjectId, agent.id, payload);
            setAgent(updatedAgent);
            setIsEditing(false);
            notify.success('Agent updated successfully!');
            performHealthCheck(selectedProjectId, updatedAgent, setAgent);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to update agent';
            notify.error(errorMsg);
        }
    };

    const handleEditToggle = () => {
        setIsEditing(true);
        setActiveTab('overview');
    };

    const handleRestart = async () => {
        if (!agent?.base_url) {
            notify.error('Agent URL is not available');
            return;
        }
        try {
            await restartAgent(agent.base_url);
            notify.success('Agent restart triggered successfully');
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to restart agent';
            notify.error(errorMsg);
        }
    };

    if (error) {
        return (
            <PageContainer>
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <h2 style={{ color: 'hsl(var(--destructive))', marginBottom: '16px' }}>Failed to load agent</h2>
                    <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '24px' }}>{error}</p>
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
                                <Layers size={12} color="hsl(var(--primary))" /> {agent?.framework || 'LANGGRAPH'}
                            </MetaText>
                            {engineVersion && (
                                <>
                                    <Separator>•</Separator>
                                    <VersionBadge
                                        $status={!latestEngineVersion ? 'neutral' : engineVersion === latestEngineVersion ? 'ok' : 'outdated'}
                                        $tooltip={latestEngineVersion && engineVersion === latestEngineVersion ? 'You are running the latest version' : undefined}
                                    >
                                        Engine v{engineVersion}
                                        {latestEngineVersion && engineVersion === latestEngineVersion && (
                                            <CheckCircle2 size={11} />
                                        )}
                                        {latestEngineVersion && engineVersion !== latestEngineVersion && (
                                            <> — <AlertTriangle size={11} /> Update to v{latestEngineVersion}</>
                                        )}
                                    </VersionBadge>
                                </>
                            )}
                        </MetaInfo>
                    </div>
                </div>

                <Actions>
                    {!isEditing && (
                        <HeaderButton onClick={handleRestart}>
                            <RotateCcw size={16} /> Restart
                        </HeaderButton>
                    )}
                    {isEditing && (
                        <HeaderButton $primary onClick={() => setSaveTrigger(t => t + 1)}>
                            <Save size={16} /> Save Changes
                        </HeaderButton>
                    )}
                    <HeaderButton $primary={!isEditing} onClick={isEditing ? () => setIsEditing(false) : handleEditToggle}>
                        {isEditing ? <><X size={16} /> Cancel Edit</> : <><Edit3 size={16} /> Edit Agent</>}
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
                            $disabled={isEditing && tab.id !== 'overview'}
                            onClick={() => handleTabClick(tab.id)}
                        >
                            <Icon size={16} style={{ marginRight: '8px' }} />
                            {tab.label}
                        </TabButton>
                    );
                })}
            </TabsNav>

            {agent && (
                <div style={{ marginBottom: '24px' }}>
                    <EnrollmentSection agent={agent} />
                </div>
            )}

            <ContentArea>
                <Suspense fallback={<Loader />}>
                    {activeTab === 'overview' && (
                        <OverviewTab
                            agent={agent}
                            isEditing={isEditing}
                            onSave={handleEditSave}
                            onCancel={() => setIsEditing(false)}
                            saveTrigger={saveTrigger}
                            onAgentRefresh={loadAgent}
                        />
                    )}
                    {activeTab === 'chat' && <ChatTab agent={agent} />}
                    {activeTab === 'gateway' && <GatewayTab agent={agent} />}
                    {activeTab === 'configuration' && <ConfigurationTab agent={agent} />}
                </Suspense>
            </ContentArea>

        </PageContainer>
    );
}

// Styled Components
const PageContainer = styled.div`
    min-height: 100vh;

    color: hsl(var(--foreground));
    padding: 24px 40px;
    display: flex;
    flex-direction: column;
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
    color: hsl(var(--muted-foreground));
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    &:hover { color: hsl(var(--foreground)); }
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
    border: 4px solid hsl(var(--card));
    background-color: ${props => props.$status.toLowerCase() === 'active' ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}; // Emerald or Red (or Gray for draft)
    ${props => props.$status.toLowerCase() === 'draft' && 'background-color: hsl(var(--muted-foreground));'}
`;

const Title = styled.h1`
    font-size: 32px;
    font-weight: 700;
    color: hsl(var(--foreground));
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
    color: hsl(var(--muted-foreground));
`;

const MetaText = styled.span`
    color: hsl(var(--muted-foreground));
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
            background-color: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
            border: none;
            box-shadow: 0 0 15px rgba(140, 82, 255, 0.3);
            &:hover { background-color: hsl(var(--primary) / 0.85); box-shadow: 0 0 20px rgba(140, 82, 255, 0.5); }
        `
        : `
            background-color: var(--overlay-light);
            color: hsl(var(--muted-foreground));
            border: 1px solid var(--border-light);
            &:hover { background-color: var(--overlay-medium); color: hsl(var(--foreground)); }
        `
    }
`;

const TabsNav = styled.div`
    display: flex;
    gap: 32px;
    border-bottom: 1px solid var(--overlay-light);
    margin-bottom: 32px;
`;

const TabButton = styled.button<{ $active: boolean; $disabled?: boolean }>`
    display: flex;
    align-items: center;
    background: none;
    border: none;
    padding: 16px 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
    position: relative;
    transition: all 0.2s;
    opacity: ${props => props.$disabled ? 0.4 : 1};

    ${props => props.$active
        ? `color: hsl(var(--foreground));`
        : `color: hsl(var(--muted-foreground)); &:hover { color: hsl(var(--foreground)); }`
    }

    &::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        right: 0;
        height: 2px;
        background-color: hsl(var(--primary));
        opacity: ${props => props.$active ? 1 : 0};
        transition: opacity 0.2s;
    }

    svg {
        color: ${props => props.$active ? 'hsl(var(--primary))' : 'currentColor'};
        transition: color 0.2s;
    }

    &:hover svg {
        color: ${props => props.$active ? 'hsl(var(--primary))' : 'hsl(var(--foreground))'};
    }
`;

const ContentArea = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
`;

const VersionBadge = styled.span<{ $status: 'ok' | 'outdated' | 'neutral'; $tooltip?: string }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    font-family: monospace;
    position: relative;
    cursor: default;
    ${props => {
        if (props.$status === 'ok') return `
            background-color: rgba(16, 185, 129, 0.1);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.2);
        `;
        if (props.$status === 'outdated') return `
            background-color: rgba(245, 158, 11, 0.1);
            color: #f59e0b;
            border: 1px solid rgba(245, 158, 11, 0.2);
        `;
        return `
            background-color: rgba(140, 82, 255, 0.1);
            color: hsl(var(--primary));
            border: 1px solid rgba(140, 82, 255, 0.2);
        `;
    }}

    ${props => props.$tooltip && `
        &::after {
            content: '${props.$tooltip}';
            position: absolute;
            bottom: calc(100% + 6px);
            left: 50%;
            transform: translateX(-50%);
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            background-color: hsl(var(--foreground));
            color: hsl(var(--background));
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.15s;
        }
        &:hover::after {
            opacity: 1;
        }
    `}
`;

const Button = styled.button`
    padding: 8px 16px;
    background-color: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
`;
