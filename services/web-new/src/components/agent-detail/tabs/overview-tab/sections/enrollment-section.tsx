import { useEffect, useState } from 'react';
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
    const [showKey, setShowKey] = useState(true);
    const [isLoadingKey, setIsLoadingKey] = useState(false);

    const managerHost = API_BASE_URL || window.location.origin;

    // Auto-fetch the API key on mount so it's visible by default
    useEffect(() => {
        let cancelled = false;
        setIsLoadingKey(true);
        getAgentApiKey(agent.id)
            .then(key => {
                if (!cancelled) setApiKey(key);
            })
            .catch(() => { /* silently fail */ })
            .finally(() => {
                if (!cancelled) setIsLoadingKey(false);
            });
        return () => { cancelled = true; };
    }, [agent.id]);

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

// -- Styles --

const Wrapper = styled.div`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    overflow: hidden;
    backdrop-filter: blur(12px);
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
    color: #e1e4e8;
    gap: 12px;
    font-family: 'IBM Plex Sans', sans-serif;

    &:hover { background: rgba(255, 255, 255, 0.02); }
`;

const HeaderLeft = styled.div``;

const HeaderTitle = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0 0 2px;
`;

const HeaderSub = styled.p`
    font-size: 12px;
    color: #8899a6;
    margin: 0;
`;

const Chevron = styled(ChevronDown)<{ $open: boolean }>`
    flex-shrink: 0;
    color: #8899a6;
    transition: transform 0.2s;
    transform: ${p => p.$open ? 'rotate(180deg)' : 'rotate(0deg)'};
`;

const Body = styled.div`
    padding: 0 20px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
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
    color: #8899a6;
    margin-bottom: 6px;
`;

const CredValue = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
`;

const CredText = styled.span<{ $mono?: boolean }>`
    flex: 1;
    font-size: 13px;
    color: #e1e4e8;
    font-family: ${p => p.$mono ? "'IBM Plex Mono', monospace" : 'inherit'};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const IconBtn = styled.button`
    padding: 3px;
    background: transparent;
    border: none;
    color: #8899a6;
    cursor: pointer;
    display: flex;
    align-items: center;
    border-radius: 4px;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover { color: #e1e4e8; background: rgba(255, 255, 255, 0.08); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SpinIcon = styled(Loader2)`
    animation: spin 0.8s linear infinite;
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin: 18px 0;
`;

const RunLabel = styled.p`
    font-size: 13px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0 0 4px;
`;

const RunSub = styled.p`
    font-size: 12px;
    color: #8899a6;
    margin: 0 0 10px;
`;
