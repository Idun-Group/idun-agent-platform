import styled, { keyframes } from 'styled-components';
import { Plus } from 'lucide-react';
import type { BackendAgent } from '../../../../../services/agents';
import { AgentAvatar } from '../../../../general/agent-avatar/component';

export interface PipelineStage {
    id: string;
    label: string;
    icon: React.FC<{ size?: number }>;
    color: string;
    configured: boolean;
    assignedNames: string[];
    onClick: () => void;
}

interface PipelineViewProps {
    agent: BackendAgent | null;
    leftStages: PipelineStage[];
    rightStages: PipelineStage[];
}

export default function PipelineView({ agent, leftStages, rightStages }: PipelineViewProps) {
    // 6 stages: 3 above the agent, 3 below
    const all = [...leftStages, ...rightStages];
    const top = all.slice(0, 3);
    const bottom = all.slice(3, 6);

    return (
        <BlockGrid>
            {/* Top row: 3 integration blocks */}
            <Row>
                {top.map(stage => <IntegrationBlock key={stage.id} stage={stage} />)}
            </Row>

            {/* Middle: agent (huge, featured) */}
            <AgentBlock>
                <AgentBackdrop />
                <AgentInner>
                    <AgentAvatar name={agent?.name || 'Agent'} size={64} />
                    <AgentInfo>
                        <AgentLabel>Agent Core</AgentLabel>
                        <AgentName>{agent?.name}</AgentName>
                    </AgentInfo>
                </AgentInner>
            </AgentBlock>

            {/* Bottom row: 3 integration blocks */}
            <Row>
                {bottom.map(stage => <IntegrationBlock key={stage.id} stage={stage} />)}
            </Row>
        </BlockGrid>
    );
}

// ── Block component ──────────────────────────────────────────────────────────

function IntegrationBlock({ stage }: { stage: PipelineStage }) {
    const Icon = stage.icon;
    const value = stage.configured
        ? stage.assignedNames[0] + (stage.assignedNames.length > 1 ? ` +${stage.assignedNames.length - 1}` : '')
        : null;

    return (
        <BlockButton
            type="button"
            $configured={stage.configured}
            $color={stage.color}
            onClick={stage.onClick}
        >
            <BlockIcon $configured={stage.configured} $color={stage.color}>
                <Icon size={22} />
            </BlockIcon>
            <BlockLabel $configured={stage.configured}>{stage.label}</BlockLabel>
            {value ? (
                <BlockValue $color={stage.color} title={stage.assignedNames.join(', ')}>{value}</BlockValue>
            ) : (
                <BlockEmpty>
                    <Plus size={11} /> Add
                </BlockEmpty>
            )}
        </BlockButton>
    );
}

// ── Animations ───────────────────────────────────────────────────────────────

const pulseGlow = keyframes`
    0%, 100% { box-shadow: 0 0 30px rgba(74, 158, 222, 0.18), inset 0 0 24px rgba(74, 158, 222, 0.08); }
    50%       { box-shadow: 0 0 50px rgba(74, 158, 222, 0.32), inset 0 0 32px rgba(74, 158, 222, 0.16); }
`;

const shimmer = keyframes`
    0%   { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
`;

// ── Layout ───────────────────────────────────────────────────────────────────

const BlockGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 24px 8px;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const Row = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
`;

// ── Integration block ───────────────────────────────────────────────────────

const BlockButton = styled.button<{ $configured: boolean; $color: string }>`
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 22px 16px;
    min-height: 130px;
    background: ${p => p.$configured
        ? `linear-gradient(180deg, ${p.$color}10 0%, ${p.$color}04 100%)`
        : 'rgba(255, 255, 255, 0.018)'};
    border: 1px solid ${p => p.$configured ? `${p.$color}30` : 'rgba(255, 255, 255, 0.05)'};
    border-radius: 14px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        background: ${p => p.$configured
            ? `linear-gradient(180deg, ${p.$color}18 0%, ${p.$color}06 100%)`
            : 'rgba(255, 255, 255, 0.035)'};
        border-color: ${p => p.$configured ? `${p.$color}55` : 'rgba(255, 255, 255, 0.12)'};
        box-shadow: ${p => p.$configured
            ? `0 8px 24px ${p.$color}15, 0 0 0 1px ${p.$color}25`
            : '0 6px 20px rgba(0,0,0,0.2)'};
    }
`;

const BlockIcon = styled.div<{ $configured: boolean; $color: string }>`
    width: 46px;
    height: 46px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${p => p.$configured
        ? `radial-gradient(circle at 30% 30%, ${p.$color}30, ${p.$color}08)`
        : 'rgba(255, 255, 255, 0.025)'};
    color: ${p => p.$configured ? p.$color : '#3a4555'};
    border: 1px solid ${p => p.$configured ? `${p.$color}40` : 'rgba(255, 255, 255, 0.05)'};
    transition: all 0.2s ease;

    ${BlockButton}:hover & {
        transform: scale(1.05);
    }
`;

const BlockLabel = styled.span<{ $configured: boolean }>`
    font-size: 12px;
    font-weight: 700;
    color: ${p => p.$configured ? '#e8edf5' : '#6b7a8d'};
    text-transform: uppercase;
    letter-spacing: 0.06em;
`;

const BlockValue = styled.span<{ $color: string }>`
    font-size: 11px;
    font-weight: 500;
    color: ${p => p.$color};
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const BlockEmpty = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #4a5568;
    text-transform: uppercase;
    letter-spacing: 0.06em;
`;

// ── Agent (featured center block) ───────────────────────────────────────────

const AgentBlock = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 130px;
    border-radius: 16px;
    border: 1.5px solid rgba(74, 158, 222, 0.4);
    background:
        linear-gradient(135deg, rgba(74, 158, 222, 0.16) 0%, rgba(167, 139, 250, 0.10) 50%, rgba(74, 158, 222, 0.06) 100%);
    overflow: hidden;
    animation: ${pulseGlow} 4s ease-in-out infinite;
`;

const AgentBackdrop = styled.div`
    position: absolute;
    inset: 0;
    background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(74, 158, 222, 0.08) 25%,
        rgba(167, 139, 250, 0.10) 50%,
        rgba(74, 158, 222, 0.08) 75%,
        transparent 100%
    );
    background-size: 200% 100%;
    animation: ${shimmer} 6s linear infinite;
    pointer-events: none;
`;

const AgentInner = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 20px 28px;
`;

const AgentInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const AgentLabel = styled.span`
    font-size: 10px;
    font-weight: 700;
    color: #4a9ede;
    text-transform: uppercase;
    letter-spacing: 0.14em;
`;

const AgentName = styled.span`
    font-size: 22px;
    font-weight: 700;
    color: #e8edf5;
    letter-spacing: -0.02em;
    line-height: 1;
`;
