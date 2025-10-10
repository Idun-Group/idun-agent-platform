import { useEffect, useState } from 'react';
import DataBoard from '../../layouts/data-board/layout';
import { useTranslation } from 'react-i18next';
import type { BackendAgent } from '../../services/agents';
import { listAgents } from '../../services/agents';
import AgentLine from '../../components/dashboard/agents/agent-line/component';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/use-auth';

const AgentDashboardPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [agents, setAgents] = useState<BackendAgent[]>([]);
    const columns = [
        {
            id: 'controls',
            label: t('dashboard.table.controls'),
            width: 90,
            sortable: false,
            alignment: 'center' as const,
        },
        {
            id: 'status',
            label: t('dashboard.table.status'),
            width: 86,
            sortable: true,
        },
        // {
        //     id: 'logs',
        //     label: t('dashboard.table.logs'),
        //     width: 80,
        //     sortable: false,
        // },
        {
            id: 'name',
            label: t('dashboard.table.name'),
            width: 200,
            sortable: true,
        },
        // {
        //     id: 'environment',
        //     label: t('dashboard.table.environment'),
        //     width: 130,
        //     sortable: true,
        // },
        {
            id: 'run',
            label: t('dashboard.table.runs'),
            width: 130,
            sortable: true,
        },
        {
            id: 'avgTime',
            label: t('dashboard.table.avgTime'),
            width: 130,
            sortable: true,
            alignment: 'center' as const,
        },
        {
            id: 'errorRate',
            label: t('dashboard.table.errorRate'),
            width: 130,
            sortable: true,
            alignment: 'center' as const,
        },
        {
            id: 'framework',
            label: t('dashboard.table.framework'),
            width: 150,
            sortable: true,
            alignment: 'center' as const,
        },
        {
            id: 'actions',
            label: t('dashboard.table.actions'),
            width: 130,
            sortable: false,
            alignment: 'center' as const,
        },
    ];

    const { session, isLoading: isAuthLoading } = useAuth();

    useEffect(() => {
        if (isAuthLoading || !session) return;
        listAgents({ limit: 20, offset: 0, sort_by: 'created_at', order: 'desc' })
            .then((rows) => setAgents(rows))
            .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                toast.error(message);
            });
    }, [isAuthLoading, session]);

    return (
        <AgentDashboardContainer>
            <DashboardHeader>
                <HeaderContent>
                    <Title>{t('dashboard.agent.title')}</Title>
                    <Description>
                        {t('dashboard.agent.description')}
                    </Description>
                </HeaderContent>
                <HeaderActions>
                    <Button
                        $variants="base"
                        $color="primary"
                        onClick={() => navigate('/agents/create')}
                    >
                        {t('dashboard.agent.create')}
                    </Button>
                </HeaderActions>
            </DashboardHeader>

            <DataBoardWrapper>
                <DataBoard
                    columns={columns}
                    data={agents}
                    searchPlaceholder={t('dashboard.search.placeholder')}
                    searchFields={['name', 'description', 'framework']}
                    showSearch={true}
                >
                    {({ paginatedData, startIndex, columns: boardColumns }) => (
                        <>
                            {paginatedData.map((agent, rowIndex) => (
                                    <AgentLine
                                    key={startIndex + rowIndex}
                                        agent={agent}
                                        onDeleted={(id) => setAgents((prev) => prev.filter((a) => a.id !== id))}
                                    columns={boardColumns}
                                />
                            ))}
                        </>
                    )}
                </DataBoard>
            </DataBoardWrapper>
        </AgentDashboardContainer>
    );
};

// Styled Components
const AgentDashboardContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    background: hsl(var(--background));
    flex: 1;
`;

const DashboardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 2rem 1.5rem 1rem 1.5rem;
    background: hsl(var(--background));
    border-bottom: 1px solid hsl(var(--border));
    flex-shrink: 0;
`;

const HeaderContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Title = styled.h1`
    font-size: 2rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const Description = styled.p`
    font-size: 1rem;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const HeaderActions = styled.div`
    display: flex;
    gap: 1rem;
    align-items: center;
`;

const DataBoardWrapper = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

export default AgentDashboardPage;
