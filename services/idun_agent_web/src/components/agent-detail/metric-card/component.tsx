import type { LucideIcon } from 'lucide-react';
import styled from 'styled-components';

export interface MetricCardProps {
    title: string;
    value: string;
    trend?: string;
    trendColor?: 'green' | 'red' | 'blue';
    icon: LucideIcon;
    iconColor?: string;
}

export default function MetricCard({
    title,
    value,
    trend,
    trendColor = 'blue',
    icon: Icon,
    iconColor = 'var(--color-primary, #8c52ff)',
}: MetricCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <IconContainer $color={iconColor}>
                    <Icon size={20} />
                </IconContainer>
            </CardHeader>
            <CardContent>
                <Value>{value}</Value>
                {trend && <Trend $color={trendColor}>{trend}</Trend>}
            </CardContent>
        </Card>
    );
}

const Card = styled.div`
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 12px;
    padding: 24px;
    transition: all 0.2s ease;

    &:hover {
        border-color: var(--color-primary, #8c52ff);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    }
`;

const CardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
`;

const CardTitle = styled.h3`
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary, #8892b0);
    margin: 0;
`;

const IconContainer = styled.div<{ $color: string }>`
    color: ${(props) => props.$color};
    display: flex;
    align-items: center;
    justify-content: center;
`;

const CardContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Value = styled.div`
    font-size: 32px;
    font-weight: 700;
    color: var(--color-text-primary, #ffffff);
    line-height: 1;
`;

const Trend = styled.div<{ $color: 'green' | 'red' | 'blue' }>`
    font-size: 14px;
    font-weight: 500;
    color: ${(props) => {
        switch (props.$color) {
            case 'green':
                return '#10b981';
            case 'red':
                return '#ef4444';
            case 'blue':
                return '#3b82f6';
            default:
                return '#8892b0';
        }
    }};
`;
