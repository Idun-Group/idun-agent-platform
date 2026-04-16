import React, { useMemo } from 'react';
import styled from 'styled-components';
import {
    Bot,
    BrainCircuit,
    Cpu,
    Sparkles,
    MessageSquare,
    Workflow,
    Network,
    Terminal,
    Zap,
    Atom,
} from 'lucide-react';

interface AgentAvatarProps {
    name: string;
    size?: number;
    className?: string;
}

/**
 * Refined dark-mode color schemes. Hashed by agent name so the pairing is deterministic.
 */
const SCHEMES = [
    { tint: '#7ab8eb', g1: '#0c5cab', g2: '#072a55', border: 'rgba(122, 184, 235, 0.35)' }, // cobalt
    { tint: '#5fe3a8', g1: '#1a4d3a', g2: '#0d2a20', border: 'rgba(95, 227, 168, 0.35)' },   // emerald
    { tint: '#e8b465', g1: '#5d4e1e', g2: '#332b10', border: 'rgba(232, 180, 101, 0.35)' },  // amber
    { tint: '#bda4f7', g1: '#4a3d6e', g2: '#28213c', border: 'rgba(189, 164, 247, 0.35)' },  // lavender
    { tint: '#5dd5e8', g1: '#1e4d5c', g2: '#0e2932', border: 'rgba(93, 213, 232, 0.35)' },   // aqua
    { tint: '#7c92ff', g1: '#2e3d6e', g2: '#1a2238', border: 'rgba(124, 146, 255, 0.35)' },  // indigo
    { tint: '#e07a8a', g1: '#5e2e3a', g2: '#33181f', border: 'rgba(224, 122, 138, 0.35)' },  // rose
    { tint: '#6cc196', g1: '#2e5240', g2: '#172a21', border: 'rgba(108, 193, 150, 0.35)' },  // mint
];

/**
 * Curated set of agent-relevant icons. All AI/automation/compute themed.
 */
const ICONS = [
    Bot,
    BrainCircuit,
    Cpu,
    Sparkles,
    MessageSquare,
    Workflow,
    Network,
    Terminal,
    Zap,
    Atom,
];

function hashName(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
    return Math.abs(h);
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ name, size = 40, className = '' }) => {
    const { Icon, scheme } = useMemo(() => {
        const h = hashName(name);
        // Use a different multiplier so icon and color don't lock-step.
        const iconIdx = Math.abs(Math.imul(h, 2654435761)) % ICONS.length;
        return {
            Icon: ICONS[iconIdx],
            scheme: SCHEMES[h % SCHEMES.length],
        };
    }, [name]);

    const iconSize = Math.max(14, Math.floor(size * 0.5));

    return (
        <AvatarBox
            size={size}
            $g1={scheme.g1}
            $g2={scheme.g2}
            $border={scheme.border}
            $tint={scheme.tint}
            className={className}
        >
            <Icon size={iconSize} strokeWidth={1.8} />
        </AvatarBox>
    );
};

const AvatarBox = styled.div<{
    size: number;
    $g1: string;
    $g2: string;
    $border: string;
    $tint: string;
}>`
    width: ${p => p.size}px;
    height: ${p => p.size}px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    background: linear-gradient(135deg, ${p => p.$g1} 0%, ${p => p.$g2} 100%);
    border: 1px solid ${p => p.$border};
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 1px 2px rgba(0, 0, 0, 0.2);
    color: ${p => p.$tint};
    user-select: none;
    transition: all 0.2s ease;
`;
