import { useEffect, useState, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { notify } from '../../components/toast/notify';
import { useProject } from '../../hooks/use-project';
import useWorkspace from '../../hooks/use-workspace';
import { Search, Plus, Bot } from 'lucide-react';
import type { BackendAgent } from '../../services/agents';
import { listAgents, deleteAgent, performHealthCheck } from '../../services/agents';
import AgentCard from '../../components/dashboard/agents/agent-card/component';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import NoProjectState from '../../components/general/no-project-state/component';

// ── Animations ───────────────────────────────────────────────────────────────

const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
`;

// ── Page ─────────────────────────────────────────────────────────────────────

const AgentDashboardPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { selectedProjectId, projects, isLoadingProjects, currentProject, canWrite, canAdmin } = useProject();
    const { isCurrentWorkspaceOwner } = useWorkspace();

    const [agents, setAgents] = useState<BackendAgent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [agentToDelete, setAgentToDelete] = useState<BackendAgent | null>(null);

    useEffect(() => {
        let cancelled = false;
        // Clear stale rows synchronously so a project switch never briefly
        // shows the previous project's agents while the new list is in flight.
        setAgents([]);
        if (!selectedProjectId) {
            setIsLoading(false);
            return () => {
                cancelled = true;
            };
        }
        setIsLoading(true);
        listAgents()
            .then((rows) => {
                if (cancelled) return;
                setAgents(rows);
                for (const agent of rows) {
                    performHealthCheck(agent, (updated) => {
                        if (!cancelled) {
                            setAgents((prev) => prev.map((a) => a.id === updated.id ? updated : a));
                        }
                    });
                }
            })
            .catch((error) => {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : String(error);
                notify.error(message);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [selectedProjectId]);

    const filteredAgents = useMemo(() => {
        if (!searchTerm) return agents;
        const q = searchTerm.toLowerCase();
        return agents.filter(
            (a) =>
                a.name.toLowerCase().includes(q) ||
                (a.description ?? '').toLowerCase().includes(q) ||
                a.framework.toLowerCase().includes(q)
        );
    }, [agents, searchTerm]);

    const handleDeleteConfirm = async () => {
        if (!agentToDelete) return;
        try {
            await deleteAgent(agentToDelete.id);
            notify.success('Agent deleted');
            setAgents((prev) => prev.filter((a) => a.id !== agentToDelete.id));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete agent';
            notify.error(message);
            throw err;
        }
    };

    // ── Empty state ──────────────────────────────────────────────────────────

    if (!selectedProjectId) {
        if (isLoadingProjects) {
            return (
                <PageWrapper>
                    <CenterBox>
                        <LoadingSpinner />
                        <LoadingText>Loading project…</LoadingText>
                    </CenterBox>
                </PageWrapper>
            );
        }
        const variant =
            projects.length === 0
                ? isCurrentWorkspaceOwner
                    ? 'no-access-owner'
                    : 'no-access-member'
                : 'none-selected';
        return (
            <NoProjectState
                variant={variant}
                pageTitle={t('dashboard.agent.title')}
                pageSubtitle={t('dashboard.agent.description', 'Manage and monitor your AI agents.')}
            />
        );
    }

    if (!isLoading && agents.length === 0) {
        return (
            <PageWrapper>
                <PageHeader>
                    <TitleBlock>
                        <PageTitle>{t('dashboard.agent.title')}</PageTitle>
                        <PageSubtitle>{`Manage agents in ${currentProject.name}`}</PageSubtitle>
                    </TitleBlock>
                </PageHeader>

                <EmptyState>
                    <EmptyIcon>
                        <Bot size={48} strokeWidth={1.2} />
                    </EmptyIcon>
                    {canWrite ? (
                        <>
                            <EmptyTitle>No agents yet</EmptyTitle>
                            <EmptyDescription>
                                {`Create your first agent in ${currentProject.name} to start monitoring and managing your AI workflows.`}
                            </EmptyDescription>
                        </>
                    ) : (
                        <>
                            <EmptyTitle>
                                {t('scopedEmpty.agents.readerTitle', 'No agents in {{project}} yet', { project: currentProject.name })}
                            </EmptyTitle>
                            <EmptyDescription>
                                {t('scopedEmpty.agents.readerDescription', 'Ask a contributor or admin to create one.')}
                            </EmptyDescription>
                        </>
                    )}
                    {canWrite && (
                        <CreateButton onClick={() => navigate('/agents/create')}>
                            <Plus size={18} />
                            {t('dashboard.agent.create')}
                        </CreateButton>
                    )}
                </EmptyState>
            </PageWrapper>
        );
    }

    // ── Main render ──────────────────────────────────────────────────────────

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>{t('dashboard.agent.title')}</PageTitle>
                    <PageSubtitle>{`Manage agents in ${currentProject.name}`}</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={15} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                        <SearchInput
                            placeholder={t('dashboard.search.placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
                    {canWrite && (
                        <CreateButton onClick={() => navigate('/agents/create')}>
                            <Plus size={16} />
                            {t('dashboard.agent.create')}
                        </CreateButton>
                    )}
                </HeaderActions>
            </PageHeader>

            {isLoading ? (
                <CenterBox>
                    <LoadingSpinner />
                    <LoadingText>Loading agents...</LoadingText>
                </CenterBox>
            ) : (
                <Grid>
                    {filteredAgents.map((agent) => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            onDeleteRequest={setAgentToDelete}
                            canWrite={canWrite}
                            canAdmin={canAdmin}
                        />
                    ))}

                    {canWrite && (
                        <AddCard onClick={() => navigate('/agents/create')}>
                            <AddIconWrapper>
                                <Plus size={28} />
                            </AddIconWrapper>
                            <AddTitle>Connect a new agent</AddTitle>
                            <AddSubtitle>Configure from a template or connect</AddSubtitle>
                        </AddCard>
                    )}
                </Grid>
            )}

            <DeleteConfirmModal
                isOpen={!!agentToDelete}
                onClose={() => setAgentToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={agentToDelete?.name ?? ''}
            />
        </PageWrapper>
    );
};

export default AgentDashboardPage;

// ── Styled components ────────────────────────────────────────────────────────

const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 32px;
    gap: 24px;
    animation: ${fadeIn} 0.3s ease;
    overflow-y: auto;
    background: hsl(var(--background));
`;

const PageHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
`;

const TitleBlock = styled.div``;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0 0 6px;
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const SearchBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 0 14px;
    height: 38px;
    transition: border-color 0.15s;

    &:focus-within {
        border-color: hsl(var(--primary) / 0.5);
    }
`;

const SearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: hsl(var(--foreground));
    font-size: 14px;
    width: 200px;

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const CreateButton = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 18px;
    height: 38px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 10px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;

    &:hover {
        opacity: 0.88;
    }
`;

// ── Grid ─────────────────────────────────────────────────────────────────────

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
`;

// ── Add card ─────────────────────────────────────────────────────────────────

const AddCard = styled.button`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: transparent;
    border: 2px dashed var(--border-light);
    border-radius: 16px;
    padding: 40px 24px;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 200px;

    &:hover {
        border-color: hsl(var(--primary));
        background: hsl(var(--primary) / 0.04);
    }

    &:hover span,
    &:hover p {
        color: hsl(var(--primary));
    }
`;

const AddIconWrapper = styled.span`
    color: var(--overlay-strong);
    transition: color 0.2s;
`;

const AddTitle = styled.span`
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    transition: color 0.2s;
`;

const AddSubtitle = styled.p`
    font-size: 13px;
    color: var(--overlay-strong);
    margin: 0;
    transition: color 0.2s;
`;

// ── Empty state ──────────────────────────────────────────────────────────────

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 16px;
    text-align: center;
    padding: 60px 24px;
`;

const EmptyIcon = styled.div`
    color: var(--border-medium);
    margin-bottom: 8px;
`;

const EmptyTitle = styled.h2`
    font-size: 20px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const EmptyDescription = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 380px;
    line-height: 1.5;
`;

// ── Loading ──────────────────────────────────────────────────────────────────

const CenterBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 80px;
`;

const LoadingSpinner = styled.div`
    width: 36px;
    height: 36px;
    border: 3px solid var(--border-light);
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

const LoadingText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;
