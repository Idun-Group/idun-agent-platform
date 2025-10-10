import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
    agentInfo,
    metricsData,
    usageData,
} from '../../../../data/agent-mock-data';
import MetricCard from '../../metric-card/component';
import UsageChart from '../usage-chart/component';
import AgentInfo from '../agent-info/component';
import type { BackendAgent } from '../../../../services/agents';

interface OverviewTabProps { agent: BackendAgent | null }

const OverviewTab = ({ agent }: OverviewTabProps) => {
    const { t } = useTranslation();
    return (
        <Container>
            <MainSection>
                <MetricsGrid>
                    {metricsData.map((metric, index) => (
                        <MetricCard
                            key={index}
                            title={t(`metrics.${metric.title}`)}
                            value={metric.value}
                            trend={metric.trend}
                            trendColor={metric.trendColor}
                            icon={metric.icon}
                            iconColor={metric.iconColor}
                        />
                    ))}
                </MetricsGrid>

                <ChartSection>
                    <UsageChart
                        title={t(
                            'overview.usageChartTitle',
                            'Usage quotidien (7 derniers jours)'
                        )}
                        data={usageData}
                    />
                </ChartSection>
            </MainSection>

            <Sidebar>
                <AgentInfo
                    framework={t(
                        `frameworks.${agent?.framework ?? 'unknown'}`,
                        agent?.framework ?? 'unknown'
                    )}
                    source={agentInfo.source}
                    tools={agentInfo.tools.map((tool: string) =>
                        t(`tools.${tool}`, tool)
                    )}
                    lastRun={agentInfo.lastRun}
                    observability={agentInfo.observability}
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

const MainSection = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 32px;
`;

const MetricsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;

    @media (max-width: 1200px) {
        grid-template-columns: repeat(2, 1fr);
    }

    @media (max-width: 768px) {
        grid-template-columns: 1fr;
    }
`;

const ChartSection = styled.div`
    flex: 1;
`;

const Sidebar = styled.div`
    width: 300px;
    flex-shrink: 0;
    height: 100%;

    @media (max-width: 1024px) {
        width: 250px;
    }
`;
