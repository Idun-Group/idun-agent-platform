import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { BackendAgent } from '../../../../services/agents';
import { AgentAvatar } from '../../../general/agent-avatar/component';
import { FeatureIcons } from './feature-icons';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentCardProps {
    agent: BackendAgent;
    onDeleteRequest: (agent: BackendAgent) => void;
    canWrite?: boolean;
    canAdmin?: boolean;
}

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { color: string; bg: string; border: string; accent: string }> = {
    active: {
        color: '#34d399',
        bg: 'rgba(52, 211, 153, 0.12)',
        border: 'rgba(52, 211, 153, 0.25)',
        accent: '#34d399',
    },
    error: {
        color: '#f87171',
        bg: 'rgba(248, 113, 113, 0.12)',
        border: 'rgba(248, 113, 113, 0.25)',
        accent: '#f87171',
    },
    deprecated: {
        color: '#fbbf24',
        bg: 'rgba(251, 191, 36, 0.12)',
        border: 'rgba(251, 191, 36, 0.25)',
        accent: '#fbbf24',
    },
    inactive: {
        color: '#888',
        bg: 'var(--overlay-light)',
        border: 'var(--border-light)',
        accent: '#555',
    },
    draft: {
        color: '#888',
        bg: 'var(--overlay-light)',
        border: 'var(--border-light)',
        accent: '#555',
    },
};

const getStatusStyle = (status: string) =>
    STATUS_STYLES[status] ?? STATUS_STYLES.draft;

const formatStatusLabel = (status: string) =>
    status.charAt(0).toUpperCase() + status.slice(1);

const formatFramework = (fw: string) => {
    const map: Record<string, string> = {
        LANGGRAPH: 'LangGraph',
        ADK: 'ADK',
        HAYSTACK: 'Haystack',
        CREWAI: 'CrewAI',
        CUSTOM: 'Custom',
    };
    return map[fw] ?? fw;
};

// ── Component ────────────────────────────────────────────────────────────────

const AgentCard: React.FC<AgentCardProps> = ({
    agent,
    onDeleteRequest,
    canWrite = true,
    canAdmin = true,
}) => {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    const statusStyle = getStatusStyle(agent.status);

    // Close menu on outside click
    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                btnRef.current &&
                !btnRef.current.contains(e.target as Node)
            ) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const handleCardClick = (e: React.MouseEvent) => {
        // Don't navigate when clicking menu area
        const target = e.target as HTMLElement;
        if (target.closest('[data-menu]')) return;
        navigate(`/agents/${agent.id}`);
    };

    return (
        <Card $accent={statusStyle.accent} onClick={handleCardClick}>
            {/* ── Header ──────────────────────────────────────────── */}
            <CardHeader>
                <AgentInfo>
                    <AgentAvatar name={agent.name} size={44} />
                    <NameBlock>
                        <AgentName>{agent.name}</AgentName>
                        <FrameworkLabel>{formatFramework(agent.framework)}</FrameworkLabel>
                    </NameBlock>
                </AgentInfo>

                <HeaderRight>
                    <StatusBadge
                        $color={statusStyle.color}
                        $bg={statusStyle.bg}
                        $border={statusStyle.border}
                    >
                        {formatStatusLabel(agent.status)}
                    </StatusBadge>

                    <MenuWrapper data-menu>
                        <MenuBtn
                            ref={btnRef}
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen((v) => !v);
                            }}
                        >
                            <MoreVertical size={16} />
                        </MenuBtn>

                        {menuOpen && (
                            <MenuPopover ref={menuRef}>
                                <MenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpen(false);
                                        navigate(`/agents/${agent.id}`);
                                    }}
                                >
                                    <Eye size={14} />
                                    View
                                </MenuItem>
                                {canWrite && (
                                    <MenuItem
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpen(false);
                                            navigate(`/agents/${agent.id}?edit=true`);
                                        }}
                                    >
                                        <Pencil size={14} />
                                        Edit
                                    </MenuItem>
                                )}
                                {canAdmin && canWrite && <MenuDivider />}
                                {canAdmin && (
                                    <MenuItem
                                        $danger
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpen(false);
                                            onDeleteRequest(agent);
                                        }}
                                    >
                                        <Trash2 size={14} />
                                        Delete
                                    </MenuItem>
                                )}
                            </MenuPopover>
                        )}
                    </MenuWrapper>
                </HeaderRight>
            </CardHeader>

            {/* ── Feature icons ────────────────────────────────────── */}
            <FeaturesSection>
                <FeatureIcons agent={agent} />
            </FeaturesSection>

            {/* ── Stats ───────────────────────────────────────────── */}
            <StatsRow>
                <StatItem>
                    <StatLabel>Runs (24h)</StatLabel>
                    <StatValue>&mdash;</StatValue>
                </StatItem>
                <StatDivider />
                <StatItem>
                    <StatLabel>Avg Latency</StatLabel>
                    <StatValue>&mdash;</StatValue>
                </StatItem>
                <StatDivider />
                <StatItem>
                    <StatLabel>Error Rate</StatLabel>
                    <StatValue>&mdash;</StatValue>
                </StatItem>
            </StatsRow>
        </Card>
    );
};

export default AgentCard;

// ── Styled components ────────────────────────────────────────────────────────

const Card = styled.div<{ $accent: string }>`
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--overlay-light);
    border-left: 3px solid ${(p) => p.$accent};
    border-radius: 16px;
    padding: 22px 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
    position: relative;

    &:hover {
        border-color: rgba(140, 82, 255, 0.25);
        border-left-color: ${(p) => p.$accent};
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
        transform: translateY(-1px);
    }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
`;

const AgentInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
`;

const NameBlock = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
`;

const AgentName = styled.span`
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const FrameworkLabel = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

const HeaderRight = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
`;

const StatusBadge = styled.span<{ $color: string; $bg: string; $border: string }>`
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 20px;
    white-space: nowrap;
    background: ${(p) => p.$bg};
    color: ${(p) => p.$color};
    border: 1px solid ${(p) => p.$border};
`;

// ── Three-dot menu ───────────────────────────────────────────────────────────

const MenuWrapper = styled.div`
    position: relative;
`;

const MenuBtn = styled.button`
    background: transparent;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;

    &:hover {
        background: var(--overlay-light);
        color: hsl(var(--foreground));
    }
`;

const MenuPopover = styled.div`
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 50;
    min-width: 140px;
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 4px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: ${(p) => (p.$danger ? '#f87171' : 'hsl(var(--muted-foreground))')};
    cursor: pointer;
    transition: background 0.12s;

    &:hover {
        background: ${(p) =>
            p.$danger ? 'rgba(248, 113, 113, 0.1)' : 'var(--overlay-light)'};
    }
`;

const MenuDivider = styled.div`
    height: 1px;
    background: var(--overlay-light);
    margin: 4px 6px;
`;

// ── Features section ─────────────────────────────────────────────────────────

const FeaturesSection = styled.div`
    padding: 4px 0;
`;

// ── Stats ────────────────────────────────────────────────────────────────────

const StatsRow = styled.div`
    display: flex;
    align-items: center;
    padding: 14px 0 0;
    border-top: 1px solid var(--overlay-light);
`;

const StatItem = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
`;

const StatLabel = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
`;

const StatValue = styled.span`
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
`;

const StatDivider = styled.div`
    width: 1px;
    height: 28px;
    background: var(--overlay-light);
    flex-shrink: 0;
`;
