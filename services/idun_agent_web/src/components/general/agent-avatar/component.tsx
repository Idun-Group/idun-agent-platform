import React, { useMemo } from 'react';
import styled from 'styled-components';
import {
  Bot,
  Brain,
  Sparkles,
  Cpu,
  Command,
  Zap,
  Terminal,
  Database,
  Fingerprint,
  ScanFace,
  Codesandbox
} from 'lucide-react';

interface AgentAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

const colorSchemes = [
  { bg: 'rgba(140, 82, 255, 0.1)', text: '#8c52ff', border: 'rgba(140, 82, 255, 0.2)' }, // Purple
  { bg: 'rgba(16, 185, 129, 0.1)', text: '#34d399', border: 'rgba(16, 185, 129, 0.2)' }, // Emerald
  { bg: 'rgba(245, 158, 11, 0.1)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.2)' }, // Amber
  { bg: 'rgba(59, 130, 246, 0.1)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.2)' }, // Blue
  { bg: 'rgba(244, 63, 94, 0.1)', text: '#fb7185', border: 'rgba(244, 63, 94, 0.2)' }, // Rose
  { bg: 'rgba(6, 182, 212, 0.1)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.2)' }, // Cyan
  { bg: 'rgba(99, 102, 241, 0.1)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.2)' }, // Indigo
];

const icons = [
  Bot,
  Brain,
  Sparkles,
  Cpu,
  Command,
  Zap,
  Terminal,
  Database,
  Fingerprint,
  ScanFace,
  Codesandbox
];

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ name, size = 40, className = '' }) => {
  const seed = useMemo(() => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = Math.imul(31, h) + name.charCodeAt(i) | 0;
    return Math.abs(h);
  }, [name]);

  const scheme = colorSchemes[seed % colorSchemes.length];
  const IconComponent = icons[seed % icons.length];

  // Calculate icon size relative to container (approx 50% of container)
  const iconSize = Math.max(16, Math.floor(size * 0.5));

  return (
    <AvatarContainer
      size={size}
      $bg={scheme.bg}
      $border={scheme.border}
      className={className}
    >
       <IconComponent size={iconSize} color={scheme.text} strokeWidth={1.5} />
    </AvatarContainer>
  );
};

const AvatarContainer = styled.div<{ size: number; $bg: string; $border: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    border: 1px solid ${props => props.$border};
    background-color: ${props => props.$bg};
    width: ${props => props.size}px;
    height: ${props => props.size}px;
    flex-shrink: 0;
    transition: all 0.2s;
`;
