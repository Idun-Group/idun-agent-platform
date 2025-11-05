import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import AgentInfo from '../agent-info/component';
import type { BackendAgent } from '../../../../services/agents';

interface OverviewTabProps { agent: BackendAgent | null }

const OverviewTab = ({ agent }: OverviewTabProps) => {
    const { t } = useTranslation();
    return (
        <Container>
            <Sidebar>
                <AgentInfo
                    framework={t(
                        `frameworks.${agent?.framework?.toLowerCase() ?? 'unknown'}`,
                        agent?.framework ?? 'UNKNOWN'
                    )}
                />
            </Sidebar>
        </Container>
    );
};

export default OverviewTab;

const Container = styled.div`
    display: flex;
    width: 98%;
    gap: 24px;
    height: 100%;
`;

// Removed mock metrics and usage chart; Overview shows dynamic agent data only

const Sidebar = styled.div`
    width: 300px;
    flex-shrink: 0;
    height: 100%;

    @media (max-width: 1024px) {
        width: 250px;
    }
`;
