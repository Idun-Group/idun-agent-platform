import React from 'react';
import { useTranslation } from 'react-i18next';
import { mockApiAgents } from '../../data/agent-mock-data';
import type { Agent } from '../../types/agent.types';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const ObservationPage: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const agents: Agent[] = mockApiAgents as any;

    return (
        <Main>
            <h1>{t('observation.title', 'Observation')}</h1>
            <List>
                {agents.map((agent) => (
                    <Item key={agent.id}>
                        <div>
                            <strong>{agent.name}</strong>
                            <p>{agent.description}</p>
                        </div>
                        <div>
                            <button
                                onClick={() => navigate(`/agents/${agent.id}`)}
                            >
                                {t('observation.view', 'View')}
                            </button>
                        </div>
                    </Item>
                ))}
            </List>
        </Main>
    );
};

export default ObservationPage;

const Main = styled.main`
    padding: 24px;
`;

const List = styled.ul`
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
`;

const Item = styled.li`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    p {
        margin: 4px 0 0 0;
        color: hsl(var(--muted-foreground));
    }
    button {
        padding: 8px 12px;
        border-radius: 6px;
        border: none;
        background: hsl(var(--app-purple));
        color: white;
        cursor: pointer;
    }
`;
