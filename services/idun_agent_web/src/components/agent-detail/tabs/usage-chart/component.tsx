import styled from 'styled-components';

export interface UsageData {
    date: string;
    success: number;
    errors: number;
    total: number;
}

export interface UsageChartProps {
    title: string;
    data: UsageData[];
}

export default function UsageChart({ title, data }: UsageChartProps) {
    // Guard against empty data arrays — use at least 1 to avoid division by 0 / NaN widths
    const maxValue = Math.max(1, ...data.map((d) => d.total));

    return (
        <ChartContainer>
            <ChartHeader>
                <ChartTitle>{title}</ChartTitle>
                <Legend>
                    <LegendItem>
                        <LegendColor $color="#10b981" />
                        <span>Success</span>
                    </LegendItem>
                    <LegendItem>
                        <LegendColor $color="#ef4444" />
                        <span>Errors</span>
                    </LegendItem>
                </Legend>
            </ChartHeader>

            <ChartContent>
                {data.map((item, index) => (
                    <ChartRow key={index}>
                        <DateLabel>{item.date}</DateLabel>
                        <BarContainer>
                            <ProgressBar>
                                <SuccessBar
                                    $width={(item.success / maxValue) * 100}
                                />
                                <ErrorBar
                                    $width={(item.errors / maxValue) * 100}
                                />
                            </ProgressBar>
                            <ValueLabel>{item.total}</ValueLabel>
                        </BarContainer>
                    </ChartRow>
                ))}
            </ChartContent>
        </ChartContainer>
    );
}

const ChartContainer = styled.div`
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    padding: 24px;
`;

const ChartHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
`;

const ChartTitle = styled.h3`
    font-size: 18px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;

    &::before {
        content: '📊';
        font-size: 20px;
    }
`;

const Legend = styled.div`
    display: flex;
    gap: 16px;
`;

const LegendItem = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: hsl(var(--muted-foreground));
`;

const LegendColor = styled.div<{ $color: string }>`
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${(props) => props.$color};
`;

const ChartContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const ChartRow = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
`;

const DateLabel = styled.div`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    min-width: 50px;
    font-weight: 500;
`;

const BarContainer = styled.div`
    flex: 1;
    display: flex;
    align-items: center;
    gap: 16px;
`;

const ProgressBar = styled.div`
    flex: 1;
    height: 20px;
    background: hsl(var(--background));
    border-radius: 10px;
    overflow: hidden;
    position: relative;
    display: flex;
`;

const SuccessBar = styled.div<{ $width: number }>`
    width: ${(props) => props.$width}%;
    background: hsl(var(--success));
    height: 100%;
    border-radius: 10px 0 0 10px;
`;

const ErrorBar = styled.div<{ $width: number }>`
    width: ${(props) => props.$width}%;
    background: hsl(var(--destructive));
    height: 100%;
`;

const ValueLabel = styled.div`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    min-width: 30px;
    text-align: right;
`;
