import React, { useMemo } from 'react';
import styled from 'styled-components';

interface AgentAvatarProps {
    name: string;
    size?: number;
    className?: string;
}

/**
 * Refined dark-mode color schemes. Each defines a gradient background +
 * accent text + border. Hashed by agent name so the pairing is deterministic.
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

function hashName(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/**
 * Extract up to 2 initials from the agent name.
 * - Multi-word: first letter of first two words ("Production Chatbot" → "PC")
 * - Single word with separators: "test-adk" → "TA"
 * - Single word: first 2 letters ("test" → "TE")
 */
function getInitials(name: string): string {
    if (!name) return '?';
    const cleaned = name.trim();
    const parts = cleaned.split(/[\s\-_]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ name, size = 40, className = '' }) => {
    const { initials, scheme } = useMemo(() => {
        const h = hashName(name);
        return {
            initials: getInitials(name),
            scheme: SCHEMES[h % SCHEMES.length],
        };
    }, [name]);

    const fontSize = Math.max(11, Math.floor(size * 0.42));

    return (
        <AvatarBox
            size={size}
            $g1={scheme.g1}
            $g2={scheme.g2}
            $border={scheme.border}
            $tint={scheme.tint}
            $fontSize={fontSize}
            className={className}
        >
            {initials}
        </AvatarBox>
    );
};

const AvatarBox = styled.div<{
    size: number;
    $g1: string;
    $g2: string;
    $border: string;
    $tint: string;
    $fontSize: number;
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
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    font-size: ${p => p.$fontSize}px;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-transform: uppercase;
    user-select: none;
    transition: all 0.2s ease;
`;
