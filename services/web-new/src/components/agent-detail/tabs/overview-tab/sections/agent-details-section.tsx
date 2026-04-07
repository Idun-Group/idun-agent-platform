import { useState, useEffect } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { Copy, Check, Wifi, WifiOff, ExternalLink, Hash, Tag, Server, Loader, ChevronDown, Info } from 'lucide-react';
import type { BackendAgent } from '../../../../../services/agents';
import type { AgentFormState } from '../../../../../utils/agent-config-utils';
import { SectionCard, SectionIcon, SectionTitle, CollapsibleHeader, CollapseChevron } from './styled';

interface Props {
    agent: BackendAgent;
    isEditing: boolean;
    formState: AgentFormState;
    onFieldChange: (field: keyof AgentFormState, value: string) => void;
}

function useLiveCheck(url: string | null | undefined) {
    const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    useEffect(() => {
        if (!url) { setStatus('offline'); return; }
        setStatus('checking');
        fetch(`${url}/health`, { mode: 'no-cors', signal: AbortSignal.timeout(4000) })
            .then(() => setStatus('online'))
            .catch(() => setStatus('offline'));
    }, [url]);
    return status;
}

function useCopy(value: string) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return { copied, copy };
}

export default function AgentDetailsSection({ agent, isEditing, formState, onFieldChange }: Props) {
    const health = useLiveCheck(agent.base_url);
    const { copied: copiedId, copy: copyId } = useCopy(agent.id);
    const { copied: copiedUrl, copy: copyUrl } = useCopy(agent.base_url ?? '');
    const [collapsed, setCollapsed] = useState(false);

    // ── Edit mode ───────────────────────────────────────────────────────────
    if (isEditing) {
        return (
            <SectionCard>
                <CollapsibleHeader $collapsed={collapsed} onClick={() => setCollapsed(c => !c)} type="button">
                    <SectionIcon $color="blue"><Info size={16} /></SectionIcon>
                    <SectionTitle>Agent Details</SectionTitle>
                    <CollapseChevron $collapsed={collapsed}>
                        <ChevronDown size={16} />
                    </CollapseChevron>
                </CollapsibleHeader>
                {!collapsed && (
                    <EditGrid>
                        <Field>
                            <Label>Name</Label>
                            <Input value={formState.name} onChange={e => onFieldChange('name', e.target.value)} placeholder="my-agent" />
                        </Field>
                        <Field>
                            <Label>Version</Label>
                            <Input value={formState.version} onChange={e => onFieldChange('version', e.target.value)} placeholder="1.0.0" />
                        </Field>
                        <Field $span>
                            <Label>Description</Label>
                            <Textarea value={formState.description} onChange={e => onFieldChange('description', e.target.value)} placeholder="What does this agent do?" rows={2} />
                        </Field>
                        <Field>
                            <Label>Base URL</Label>
                            <Input value={formState.baseUrl} onChange={e => onFieldChange('baseUrl', e.target.value)} placeholder="http://localhost:8800" />
                        </Field>
                        <Field>
                            <Label>Server Port</Label>
                            <Input value={formState.serverPort} onChange={e => onFieldChange('serverPort', e.target.value)} placeholder="8000" type="number" />
                        </Field>
                    </EditGrid>
                )}
            </SectionCard>
        );
    }

    // ── View mode ───────────────────────────────────────────────────────────
    const baseUrl = agent.base_url;

    return (
        <SectionCard>
            <CollapsibleHeader $collapsed={collapsed} onClick={() => setCollapsed(c => !c)} type="button">
                <SectionIcon $color="blue"><Info size={16} /></SectionIcon>
                <SectionTitle>Agent Details</SectionTitle>
                <CollapseChevron $collapsed={collapsed}>
                    <ChevronDown size={16} />
                </CollapseChevron>
            </CollapsibleHeader>
            {collapsed ? null : (
            <Root>
            {/* Status banner */}
            <StatusBanner $status={health}>
                <BannerLeft>
                    <BannerIcon $status={health}>
                        {health === 'checking'
                            ? <Loader size={16} />
                            : health === 'online'
                                ? <Wifi size={16} />
                                : <WifiOff size={16} />
                        }
                    </BannerIcon>
                    <BannerText>
                        <BannerTitle $status={health}>
                            {health === 'checking' ? 'Checking connection...' : health === 'online' ? 'Agent Online' : 'Agent Offline'}
                        </BannerTitle>
                        {baseUrl && (
                            <BannerUrl>{baseUrl}</BannerUrl>
                        )}
                        {!baseUrl && (
                            <BannerUrl style={{ fontStyle: 'italic', opacity: 0.5 }}>No URL configured</BannerUrl>
                        )}
                    </BannerText>
                </BannerLeft>
                {baseUrl && (
                    <BannerActions>
                        <BannerBtn onClick={copyUrl} title="Copy URL">
                            {copiedUrl ? <Check size={13} /> : <Copy size={13} />}
                        </BannerBtn>
                        <BannerBtn as="a" href={baseUrl} target="_blank" rel="noopener noreferrer" title="Open in new tab">
                            <ExternalLink size={13} />
                        </BannerBtn>
                    </BannerActions>
                )}
            </StatusBanner>

            {/* Meta chips row */}
            <MetaRow>
                {agent.version && (
                    <MetaChip>
                        <Tag size={11} />
                        v{agent.version}
                    </MetaChip>
                )}
                {agent.framework && (
                    <MetaChip $highlight>
                        {agent.framework}
                    </MetaChip>
                )}
                {agent.engine_config?.server?.api?.port && (
                    <MetaChip>
                        <Server size={11} />
                        :{agent.engine_config.server.api.port}
                    </MetaChip>
                )}
                <MetaChipCopyable onClick={copyId} title="Click to copy Agent ID">
                    <Hash size={11} />
                    <span>{agent.id.slice(0, 8)}…</span>
                    {copiedId ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                </MetaChipCopyable>
            </MetaRow>

            {/* Description */}
            {agent.description && (
                <DescBox>{agent.description}</DescBox>
            )}
            </Root>
            )}
        </SectionCard>
    );
}

// ── Animations ───────────────────────────────────────────────────────────────

const spin = keyframes`
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
`;

const pulseGlow = keyframes`
    0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.15); }
    50%       { box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); }
`;

// ── View styles ───────────────────────────────────────────────────────────────

const Root = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const STATUS_BG: Record<string, string> = {
    online:   'rgba(52, 211, 153, 0.05)',
    offline:  'rgba(255, 255, 255, 0.02)',
    checking: 'rgba(245, 158, 11, 0.03)',
};
const STATUS_BORDER: Record<string, string> = {
    online:   'rgba(52, 211, 153, 0.2)',
    offline:  'rgba(255, 255, 255, 0.06)',
    checking: 'rgba(245, 158, 11, 0.1)',
};

const StatusBanner = styled.div<{ $status: string }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-radius: 10px;
    background: ${p => STATUS_BG[p.$status] ?? STATUS_BG.offline};
    border: 1px solid ${p => STATUS_BORDER[p.$status] ?? STATUS_BORDER.offline};
    transition: all 0.3s ease;
    ${p => p.$status === 'online' && css`animation: ${pulseGlow} 3s ease-in-out infinite;`}
`;

const BannerLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const STATUS_ICON_COLOR: Record<string, string> = {
    online:   '#34d399',
    offline:  '#4a5568',
    checking: '#f59e0b',
};

const BannerIcon = styled.div<{ $status: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${p => STATUS_ICON_COLOR[p.$status] ?? '#4a5568'};
    ${p => p.$status === 'checking' && css`
        animation: ${spin} 1.2s linear infinite;
    `}
`;

const BannerText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const BannerTitle = styled.span<{ $status: string }>`
    font-size: 13px;
    font-weight: 600;
    color: ${p => STATUS_ICON_COLOR[p.$status] ?? '#4a5568'};
`;

const BannerUrl = styled.span`
    font-size: 11px;
    color: #4a5568;
    font-family: 'IBM Plex Mono', monospace;
`;

const BannerActions = styled.div`
    display: flex;
    gap: 6px;
`;

const BannerBtn = styled.button`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    color: #6b7a8d;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.12s;

    &:hover {
        color: #e1e4e8;
        border-color: rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.07);
    }
`;

const MetaRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
`;

const MetaChip = styled.span<{ $highlight?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    background: ${p => p.$highlight ? 'rgba(12, 92, 171, 0.1)' : 'rgba(255, 255, 255, 0.04)'};
    color: ${p => p.$highlight ? '#4a9ede' : '#8899a6'};
    border: 1px solid ${p => p.$highlight ? 'rgba(12, 92, 171, 0.2)' : 'rgba(255, 255, 255, 0.06)'};
    font-family: 'IBM Plex Sans', sans-serif;
`;

const MetaChipCopyable = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.03);
    color: #6b7a8d;
    border: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: all 0.12s;

    &:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #8899a6;
        border-color: rgba(255, 255, 255, 0.1);
    }
`;

const DescBox = styled.p`
    margin: 0;
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.6;
    color: #8899a6;
    background: rgba(255, 255, 255, 0.015);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 8px;
`;

// ── Edit styles ───────────────────────────────────────────────────────────────

const EditRoot = styled.div`
    font-family: 'IBM Plex Sans', sans-serif;
`;

const EditGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
`;

const Field = styled.div<{ $span?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 6px;
    ${p => p.$span && 'grid-column: 1 / -1;'}
`;

const Label = styled.label`
    font-size: 12px;
    font-weight: 500;
    color: #6b7a8d;
`;

const Input = styled.input`
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 9px 12px;
    color: #e1e4e8;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    &:focus { outline: none; border-color: #0C5CAB; box-shadow: 0 0 0 2px rgba(12,92,171,0.1); }
`;

const Textarea = styled.textarea`
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 9px 12px;
    color: #e1e4e8;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    resize: vertical;
    min-height: 60px;
    &:focus { outline: none; border-color: #0C5CAB; box-shadow: 0 0 0 2px rgba(12,92,171,0.1); }
`;
