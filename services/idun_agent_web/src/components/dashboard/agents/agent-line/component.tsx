import styled from 'styled-components';
import type { Agent, TableColumn } from '../../../../types/agent.types';
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
    agent: Agent;
    columns: TableColumn[];
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

export default function AgentLine({ agent, columns }: AgentLineProps) {
    const navigate = useNavigate();
    const selectStatus = (status: string) => {
        switch (status) {
            case 'running':
                return 'green';
            case 'stopped':
                return 'red';
            case 'error':
                return 'red';
            case 'failed':
                return 'red';
            case 'disabled':
                return 'gray';
            case 'pending_deployment':
                return 'orange';
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
            <TableCell
                style={{
                    textAlign: getColumnAlignment('controls'),
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '8px',
                }}
            >
                <Button
                    $variants="transparent"
                    $color="primary"
                    onClick={() => toast('Controls not implemented yet')}
                >
                    {
                        {
                            running: <StopCircleIcon />,
                            stopped: <PlayIcon />,
                            deployed: <CloudIcon />,
                            disabled: <PlayIcon />,
                            error: <ListRestartIcon />,
                            failed: <ListRestartIcon />,
                            pending_deployment: <PlayIcon />,
                        }[agent.status]
                    }
                </Button>
            </TableCell>
            <TableCell
                style={{
                    textAlign: getColumnAlignment('status'),
                }}
            >
                <AgentStatusPoint color={selectStatus(agent.status)} />
            </TableCell>
            <TableCell style={{ textAlign: getColumnAlignment('name') }}>
                <Link to={`/agents/${agent.id}`}>{agent.name}</Link>
            </TableCell>
            <TableCell style={{ textAlign: getColumnAlignment('run') }}>
                Agent Runs
            </TableCell>
            <TableCell style={{ textAlign: getColumnAlignment('avgTime') }}>
                Avg Time
            </TableCell>
            <TableCell style={{ textAlign: getColumnAlignment('errorRate') }}>
                Error Rate
            </TableCell>
            <TableCell style={{ textAlign: getColumnAlignment('framework') }}>
                {agent.framework_type}
            </TableCell>
            <ActionsContainer
                style={{
                    textAlign: getColumnAlignment('actions'),
                }}
            >
                <Button
                    $variants="transparent"
                    onClick={() => navigate(`/agents/${agent.id}`)}
                >
                    <EyeIcon size={24} />
                </Button>
                <Button
                    $variants="transparent"
                    onClick={() =>
                        toast('Edit functionality not implemented yet')
                    }
                >
                    <EditIcon size={24} />
                </Button>
                <Button $variants="transparent">
                    <Trash2
                        size={24}
                        onClick={() =>
                            toast('Delete functionality not implemented yet')
                        }
                    />
                </Button>
            </ActionsContainer>
        </TableRow>
    );
}

const AgentStatusPoint = styled.div<{ color: string }>`
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: ${(props) => props.color || 'grey'};
    display: inline-block;
`;
