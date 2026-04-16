import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { MoreVertical, Eye, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { BackendAgent } from '../../../../services/agents';
import { AgentAvatar } from '../../../general/agent-avatar/component';
import { FeatureIcons } from './feature-icons';

interface AgentCardProps {
    agent: BackendAgent;
    onDeleteRequest: (agent: BackendAgent) => void;
}

const STATUS_MAP: Record<string, { color: string; bg: string; dot: string }> = {
    active:     { color: '#34d399', bg: 'rgba(52, 211, 153, 0.08)', dot: '#34d399' },
    error:      { color: '#f87171', bg: 'rgba(248, 113, 113, 0.08)', dot: '#f87171' },
    deprecated: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)', dot: '#fbbf24' },
    inactive:   { color: '#6b7a8d', bg: 'rgba(107, 122, 141, 0.06)', dot: '#6b7a8d' },
    draft:      { color: '#6b7a8d', bg: 'rgba(107, 122, 141, 0.06)', dot: '#6b7a8d' },
};

const FW_LABELS: Record<string, string> = {
    LANGGRAPH: 'LangGraph', ADK: 'ADK', HAYSTACK: 'Haystack',
    CREWAI: 'CrewAI', CUSTOM: 'Custom',
};

const AgentCard: React.FC<AgentCardProps> = ({ agent, onDeleteRequest }) => {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    const status = STATUS_MAP[agent.status] ?? STATUS_MAP.draft;

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node))
                setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const onClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-menu]')) return;
        navigate(`/agents/${agent.id}`);
    };

    return (
        <Card onClick={onClick}>
            {/* Header: Avatar + Name + Status + Menu */}
            <TopRow>
                <AvatarWrap>
                    <AgentAvatar name={agent.name} size={38} />
                    <StatusDot $color={status.dot} />
                </AvatarWrap>
                <Info>
                    <Name>{agent.name}</Name>
                    <Meta>
                        <FwBadge>{FW_LABELS[agent.framework] ?? agent.framework}</FwBadge>
                        <StatusLabel $color={status.color}>{agent.status}</StatusLabel>
                    </Meta>
                </Info>
                <MenuWrap data-menu>
                    <MenuBtn ref={btnRef} onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}>
                        <MoreVertical size={15} />
                    </MenuBtn>
                    {menuOpen && (
                        <Popover ref={menuRef}>
                            <PopItem onClick={(e) => { e.stopPropagation(); setMenuOpen(false); navigate(`/agents/${agent.id}`); }}>
                                <Eye size={13} /> View
                            </PopItem>
                            <PopItem onClick={(e) => { e.stopPropagation(); setMenuOpen(false); navigate(`/agents/${agent.id}?edit=true`); }}>
                                <Pencil size={13} /> Edit
                            </PopItem>
                            <PopDivider />
                            <PopItem $danger onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDeleteRequest(agent); }}>
                                <Trash2 size={13} /> Delete
                            </PopItem>
                        </Popover>
                    )}
                </MenuWrap>
            </TopRow>

            {/* Description */}
            {agent.description ? (
                <Desc>{agent.description.length > 100 ? agent.description.slice(0, 100).trimEnd() + '…' : agent.description}</Desc>
            ) : (
                <DescMuted>No description provided</DescMuted>
            )}

            {/* Feature Icons — shows all 6 integrations with active/inactive state */}
            <FeaturesRow>
                <FeatureIcons agent={agent} />
            </FeaturesRow>

            {/* Footer: URL */}
            <Footer>
                {agent.base_url ? (
                    <Url title={agent.base_url}>
                        <ExternalLink size={11} />
                        {agent.base_url.replace(/^https?:\/\//, '').slice(0, 32)}
                    </Url>
                ) : (
                    <Url style={{ opacity: 0.35 }}>Not connected</Url>
                )}
            </Footer>
        </Card>
    );
};

export default AgentCard;

// ── Styles ──────────────────────────────────────────────────────────────────

const Card = styled.div`
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;

    &:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(12, 92, 171, 0.25);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
        transform: translateY(-2px);
    }
`;

const TopRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const AvatarWrap = styled.div`
    position: relative;
    flex-shrink: 0;
`;

const StatusDot = styled.div<{ $color: string }>`
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${p => p.$color};
    border: 2px solid #0d1117;
`;

const Info = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Name = styled.span`
    font-size: 15px;
    font-weight: 600;
    color: #e8edf5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Meta = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const FwBadge = styled.span`
    font-size: 11px;
    font-weight: 500;
    color: #4a9ede;
    background: rgba(12, 92, 171, 0.1);
    padding: 1px 7px;
    border-radius: 4px;
`;

const StatusLabel = styled.span<{ $color: string }>`
    font-size: 11px;
    font-weight: 500;
    color: ${p => p.$color};
    text-transform: capitalize;
`;

const Desc = styled.p`
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: #8899a6;
`;

const DescMuted = styled.p`
    margin: 0;
    font-size: 13px;
    color: #3d4f63;
    font-style: italic;
`;

const FeaturesRow = styled.div`
    padding: 4px 0;
`;

const Footer = styled.div`
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
`;

const Url = styled.span`
    font-size: 11px;
    color: #4a5568;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: 'IBM Plex Mono', monospace;
`;

// ── Menu ────────────────────────────────────────────────────────────────────

const MenuWrap = styled.div`
    position: relative;
    flex-shrink: 0;
`;

const MenuBtn = styled.button`
    background: transparent;
    border: none;
    color: #4a5568;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    &:hover { background: rgba(255, 255, 255, 0.06); color: #e8edf5; }
`;

const Popover = styled.div`
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 50;
    min-width: 140px;
    background: #141a26;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 4px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
`;

const PopItem = styled.button<{ $danger?: boolean }>`
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
    font-family: inherit;
    color: ${p => p.$danger ? '#f87171' : '#8a9bb5'};
    cursor: pointer;
    &:hover { background: ${p => p.$danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.06)'}; }
`;

const PopDivider = styled.div`
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 4px 6px;
`;
