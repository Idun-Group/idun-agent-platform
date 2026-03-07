import { useState } from 'react';
import styled from 'styled-components';
import { Copy, Eye, EyeOff, ChevronDown, Loader2 } from 'lucide-react';
import type { BackendAgent } from '../../../../../services/agents';
import { getAgentApiKey } from '../../../../../services/agents';
import { API_BASE_URL } from '../../../../../utils/api';
import CodeSnippet from '../../../../../pages/agent-form/components/code-snippet';

interface Props {
    agent: BackendAgent;
}

export default function EnrollmentSection({ agent }: Props) {
    const [open, setOpen] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [showKey, setShowKey] = useState(false);
    const [isLoadingKey, setIsLoadingKey] = useState(false);

    const managerHost = API_BASE_URL || window.location.origin;

    const handleToggleKey = async () => {
        if (apiKey) {
            setShowKey(v => !v);
            return;
        }
        setIsLoadingKey(true);
        try {
            const key = await getAgentApiKey(agent.id);
            setApiKey(key);
            setShowKey(true);
        } catch {
            // silently fail — user can retry
        } finally {
            setIsLoadingKey(false);
        }
    };

    const cliCode = [
        'pip install idun-agent-engine',
        '',
        `export IDUN_MANAGER_HOST="${managerHost}"`,
        `export IDUN_AGENT_API_KEY="${apiKey && showKey ? apiKey : '<your-api-key>'}"`,
        '',
        'idun agent serve --source=manager',
    ].join('\n');

    return (
        <Wrapper>
            <Header onClick={() => setOpen(o => !o)}>
                <HeaderLeft>
                    <HeaderTitle>Connect to Platform</HeaderTitle>
                    <HeaderSub>How to run and connect this agent</HeaderSub>
                </HeaderLeft>
                <Chevron size={16} $open={open} />
            </Header>

            {open && (
                <Body>
                    <CredRow>
                        <CredLabel>Manager Host</CredLabel>
                        <CredValue>
                            <CredText>{managerHost}</CredText>
                            <IconBtn
                                type="button"
                                title="Copy"
                                onClick={() => navigator.clipboard.writeText(managerHost)}
                            >
                                <Copy size={13} />
                            </IconBtn>
                        </CredValue>
                    </CredRow>

                    <CredRow>
                        <CredLabel>API Key</CredLabel>
                        <CredValue>
                            <CredText $mono>
                                {apiKey && showKey ? apiKey : '••••••••••••••••••••••••'}
                            </CredText>
                            <IconBtn
                                type="button"
                                title={showKey ? 'Hide' : 'Show'}
                                onClick={handleToggleKey}
                                disabled={isLoadingKey}
                            >
                                {isLoadingKey
                                    ? <SpinIcon size={13} />
                                    : showKey
                                        ? <EyeOff size={13} />
                                        : <Eye size={13} />
                                }
                            </IconBtn>
                            {apiKey && (
                                <IconBtn
                                    type="button"
                                    title="Copy"
                                    onClick={() => navigator.clipboard.writeText(apiKey)}
                                >
                                    <Copy size={13} />
                                </IconBtn>
                            )}
                        </CredValue>
                    </CredRow>

                    <Divider />

                    <RunLabel>Run your agent</RunLabel>
                    <RunSub>
                        Install the engine and run these commands in your agent project directory:
                    </RunSub>
                    <CodeSnippet code={cliCode} language="bash" />
                </Body>
            )}
        </Wrapper>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
    background: var(--overlay-subtle);
    border: 1px solid var(--overlay-light);
    border-radius: 12px;
    overflow: hidden;
`;

const Header = styled.button`
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: hsl(var(--foreground));
    gap: 12px;

    &:hover { background: var(--overlay-subtle); }
`;

const HeaderLeft = styled.div``;

const HeaderTitle = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 2px;
`;

const HeaderSub = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const Chevron = styled(ChevronDown)<{ $open: boolean }>`
    flex-shrink: 0;
    color: hsl(var(--muted-foreground));
    transition: transform 0.2s;
    transform: ${p => p.$open ? 'rotate(180deg)' : 'rotate(0deg)'};
`;

const Body = styled.div`
    padding: 0 20px 20px;
    border-top: 1px solid var(--overlay-light);
    padding-top: 20px;
`;

const CredRow = styled.div`
    margin-bottom: 14px;
`;

const CredLabel = styled.label`
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
    margin-bottom: 6px;
`;

const CredValue = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    background: hsl(var(--accent));
    border: 1px solid var(--border-light);
    border-radius: 8px;
`;

const CredText = styled.span<{ $mono?: boolean }>`
    flex: 1;
    font-size: 13px;
    color: hsl(var(--foreground));
    font-family: ${p => p.$mono ? "'SF Mono', 'Fira Code', Menlo, monospace" : 'inherit'};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const IconBtn = styled.button`
    padding: 3px;
    background: transparent;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    display: flex;
    align-items: center;
    border-radius: 4px;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover { color: hsl(var(--foreground)); background: var(--overlay-medium); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SpinIcon = styled(Loader2)`
    animation: spin 0.8s linear infinite;
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid var(--overlay-light);
    margin: 18px 0;
`;

const RunLabel = styled.p`
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px;
`;

const RunSub = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0 0 10px;
`;
