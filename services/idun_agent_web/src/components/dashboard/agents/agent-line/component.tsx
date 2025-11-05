import styled from 'styled-components';
import type { TableColumn } from '../../../../types/agent.types';
import type { BackendAgent } from '../../../../services/agents';
import { deleteAgent } from '../../../../services/agents';
import { Button } from '../../../general/button/component';
import {
    CloudIcon,
    EditIcon,
    EyeIcon,
    ListRestartIcon,
    PlayIcon,
    StopCircleIcon,
    Trash2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    ActionsContainer,
    TableCell,
    TableRow,
} from '../../table-components/component';

interface AgentLineProps {
    agent: BackendAgent;
    columns: TableColumn[];
    onDeleted?: (agentId: string) => void;
}

// const ActionButton = styled.button`
//     background: transparent;
//     border: 1px solid var(--color-border-primary);
//     border-radius: 6px;
//     padding: 8px;
//     color: var(--color-text-secondary);
//     cursor: pointer;
//     transition: all var(--transition-default);
//     display: inline-flex;
//     align-items: center;
//     justify-content: center;

//     &:hover {
//         background: var(--color-background-tertiary);
//         color: var(--color-text-primary);
//         border-color: var(--color-primary);
//     }

//     &:active {
//         background: var(--color-background-primary);
//     }
// `;

// const StatusIndicator = styled.div`
//     display: flex;
//     align-items: center;
//     gap: 8px;
// `;

// const StatusDot = styled.div<{ color: string }>`
//     width: 8px;
//     height: 8px;
//     border-radius: 50%;
//     background-color: ${(props) => props.color};
//     flex-shrink: 0;
// `;

// const StatusText = styled.span`
//     color: var(--color-text-secondary);
//     font-size: 12px;
//     text-transform: capitalize;
// `;

// const AgentLink = styled(Link)`
//     color: var(--color-text-primary);
//     text-decoration: none;
//     font-weight: 500;
//     transition: color var(--transition-default);

//     &:hover {
//         color: var(--color-primary);
//         text-decoration: underline;
//     }
// `;

// const MetricValue = styled.span`
//     color: var(--color-text-secondary);
//     font-size: 14px;
// `;

// const FrameworkTag = styled.span`
//     background: var(--color-background-tertiary);
//     color: var(--color-text-secondary);
//     padding: 4px 8px;
//     border-radius: 4px;
//     font-size: 12px;
//     font-weight: 500;
//     border: 1px solid var(--color-border-primary);
// `;

export default function AgentLine({ agent, columns, onDeleted }: AgentLineProps) {
    const navigate = useNavigate();
    const selectStatus = (status: BackendAgent['status']) => {
        switch (status) {
            case 'active':
                return 'green';
            case 'error':
                return 'red';
            case 'deprecated':
                return 'orange';
            case 'inactive':
                return 'gray';
            case 'draft':
            default:
                return 'gray';
        }
    };

    const getColumnAlignment = (columnId: string) => {
        const column = columns.find((col) => col.id === columnId);
        return column?.alignment || 'left';
    };

    return (
        <TableRow>
            {/* removed left controls to match design */}
            <TableCell data-column="status"
                style={{
                    textAlign: getColumnAlignment('status'),
                }}
            >
                <AgentStatusPoint color={selectStatus(agent.status)} />
            </TableCell>
            <TableCell data-column="name" style={{ textAlign: getColumnAlignment('name') }}>
                <Link to={`/agents/${agent.id}`}>{agent.name}</Link>
            </TableCell>
            <TableCell data-column="run" style={{ textAlign: getColumnAlignment('run') }}>
                Agent Runs
            </TableCell>
            <TableCell data-column="avgTime" style={{ textAlign: getColumnAlignment('avgTime') }}>
                Avg Time
            </TableCell>
            <TableCell data-column="errorRate" style={{ textAlign: getColumnAlignment('errorRate') }}>
                Error Rate
            </TableCell>
            <TableCell data-column="framework" style={{ textAlign: getColumnAlignment('framework') }}>
                <FrameworkBadge>{agent.framework}</FrameworkBadge>
            </TableCell>
            <TableCell data-column="a2a" style={{ textAlign: getColumnAlignment('a2a') }}>
                <A2ABadge>Activé</A2ABadge>
            </TableCell>
            <ActionsContainer
                data-column="actions"
                style={{
                    textAlign: getColumnAlignment('actions'),
                }}
            >
                <Button
                    $variants="transparent"
                    title="Logs"
                    onClick={() => {
                        const host = (agent as any)?.run_config?.env?.LANGFUSE_HOST as string | undefined;
                        const url = host && !host.includes('${') ? host : 'https://cloud.langfuse.com';
                        if (typeof window !== 'undefined') window.open(url, '_blank');
                    }}
                >
                    <CloudIcon size={18} />
                </Button>
                {/* View button removed to match design; edit button remains */}
                <Button
                    $variants="transparent"
                    title="Edit"
                    onClick={() => navigate(`/agents/${agent.id}`)}
                >
                    <EditIcon size={18} />
                </Button>
                <Button $variants="transparent" title="Delete">
                    <Trash2
                        size={18}
                        onClick={async () => {
                            try {
                                const confirmed = window.confirm('Delete this agent?');
                                if (!confirmed) return;
                                await deleteAgent(agent.id);
                                toast.success('Agent deleted');
                                onDeleted?.(agent.id);
                            } catch (e) {
                                const message = e instanceof Error ? e.message : 'Failed to delete agent';
                                toast.error(message);
                            }
                        }}
                    />
                </Button>
            </ActionsContainer>
        </TableRow>
    );
}

const AgentStatusPoint = styled.div<{ color: string }>`
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${(props) => props.color || 'grey'};
    display: inline-block;
`;

const FrameworkBadge = styled.span`
    background: rgba(140, 82, 255, 0.2);
    color: #a78bfa;
    padding: 4px 8px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(140, 82, 255, 0.3);
`;

const A2ABadge = styled.span`
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
    padding: 4px 8px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(16, 185, 129, 0.3);
`;
