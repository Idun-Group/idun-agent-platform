import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { CheckCircle2, AlertCircle, Copy, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { notify } from '../../../components/toast/notify';
import { createAgent, patchAgent, getAgentApiKey, performHealthCheck } from '../../../services/agents';
import { API_BASE_URL } from '../../../utils/api';
import { type WizardState, resolveBaseUrl, resolveServerPort } from '../types';
import CodeSnippet from '../components/code-snippet';
import ConnectionVerifier from '../components/connection-verifier';
import Confetti from '../components/confetti';

interface EnrollmentStepProps {
    state: WizardState;
    onCreated: (agentId: string, apiKey: string) => void;
}

function buildPayload(state: WizardState) {
    const { name, framework } = state;

    const agentConfig = framework === 'LANGGRAPH'
        ? { name, graph_definition: state.graphDefinition, checkpointer: { type: 'memory' } }
        : { name, agent: state.adkAgent, app_name: state.adkAppName, session_service: { type: 'in_memory' } };

    return {
        name,
        base_url: resolveBaseUrl(state) || null,
        engine_config: {
            server: { api: { port: resolveServerPort(state) } },
            agent: {
                type: framework,
                config: agentConfig,
            },
        },
    };
}

export default function EnrollmentStep({ state, onCreated }: EnrollmentStepProps) {
    const [phase, setPhase] = useState<'creating' | 'updating' | 'error' | 'ready'>(
        state.createdAgentId ? 'ready' : 'creating'
    );
    const [errorMessage, setErrorMessage] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const attemptedRef = useRef(false);
    const lastPayloadRef = useRef<string>('');

    const managerHost = API_BASE_URL || window.location.origin;

    useEffect(() => {
        const payload = buildPayload(state);
        const payloadJson = JSON.stringify(payload);

        // If agent already exists, check if config changed since last apply
        if (state.createdAgentId) {
            if (payloadJson === lastPayloadRef.current) return;
            // Config changed — update the existing agent
            lastPayloadRef.current = payloadJson;
            setPhase('updating');
            (async () => {
                try {
                    const updated = await patchAgent(state.createdAgentId!, payload);
                    performHealthCheck(updated);
                    setPhase('ready');
                    notify.success('Agent configuration updated');
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to update agent';
                    setErrorMessage(msg);
                    setPhase('error');
                }
            })();
            return;
        }

        // First time — create
        if (attemptedRef.current) return;
        attemptedRef.current = true;

        (async () => {
            try {
                const agent = await createAgent(payload);
                const apiKey = await getAgentApiKey(agent.id);
                lastPayloadRef.current = payloadJson;
                onCreated(agent.id, apiKey);
                performHealthCheck(agent);
                setShowConfetti(true);
                setPhase('ready');
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to create agent';
                setErrorMessage(msg);
                setPhase('error');
            }
        })();
    }, [state, onCreated]);

    const handleRetry = async () => {
        const payload = buildPayload(state);
        const isUpdate = !!state.createdAgentId;
        setPhase(isUpdate ? 'updating' : 'creating');
        setErrorMessage('');
        try {
            if (isUpdate) {
                const updated = await patchAgent(state.createdAgentId!, payload);
                performHealthCheck(updated);
            } else {
                const agent = await createAgent(payload);
                const apiKey = await getAgentApiKey(agent.id);
                onCreated(agent.id, apiKey);
                performHealthCheck(agent);
                setShowConfetti(true);
            }
            lastPayloadRef.current = JSON.stringify(payload);
            setPhase('ready');
        } catch (err) {
            const msg = err instanceof Error ? err.message : `Failed to ${isUpdate ? 'update' : 'create'} agent`;
            setErrorMessage(msg);
            setPhase('error');
        }
    };

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
        notify.success('Copied to clipboard');
    };

    if (phase === 'creating' || phase === 'updating') {
        const isUpdate = phase === 'updating';
        return (
            <CenterContainer>
                <SpinningLoader size={32} />
                <LoadingTitle>{isUpdate ? 'Updating your agent...' : 'Creating your agent...'}</LoadingTitle>
                <LoadingSubtitle>{isUpdate ? 'Applying configuration changes' : 'Setting up configuration and generating API key'}</LoadingSubtitle>
            </CenterContainer>
        );
    }

    if (phase === 'error') {
        return (
            <CenterContainer>
                <AlertCircle size={32} color="#f87171" />
                <ErrorTitle>{errorMessage.includes('update') ? 'Failed to update agent' : 'Failed to create agent'}</ErrorTitle>
                <ErrorMessage>{errorMessage}</ErrorMessage>
                <RetryButton onClick={handleRetry} type="button">Try Again</RetryButton>
            </CenterContainer>
        );
    }

    const cliCode = [
        'pip install idun-agent-engine',
        '',
        `export IDUN_MANAGER_HOST="${managerHost}"`,
        `export IDUN_AGENT_API_KEY="${state.apiKey}"`,
        '',
        'idun agent serve --source=manager',
    ].join('\n');

    return (
        <StepContainer>
            {showConfetti && <Confetti />}
            <SuccessBanner>
                <CheckCircle2 size={20} />
                Agent created successfully!
            </SuccessBanner>

            <SectionTitle>Connection Details</SectionTitle>

            <CredentialRow>
                <CredentialLabel>Manager Host</CredentialLabel>
                <CredentialValue>
                    <CredentialText>{managerHost}</CredentialText>
                    <IconButton onClick={() => copyToClipboard(managerHost)} type="button" title="Copy">
                        <Copy size={14} />
                    </IconButton>
                </CredentialValue>
            </CredentialRow>

            <CredentialRow>
                <CredentialLabel>API Key</CredentialLabel>
                <CredentialValue>
                    <CredentialText $mono>
                        {showKey ? state.apiKey : '••••••••••••••••••••••••'}
                    </CredentialText>
                    <IconButton onClick={() => setShowKey(!showKey)} type="button" title={showKey ? 'Hide' : 'Show'}>
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </IconButton>
                    <IconButton onClick={() => copyToClipboard(state.apiKey ?? '')} type="button" title="Copy">
                        <Copy size={14} />
                    </IconButton>
                </CredentialValue>
            </CredentialRow>

            <Divider />

            <SectionTitle>Connect your agent</SectionTitle>
            <SectionSubtitle>Run these commands in your agent project to connect it to the platform:</SectionSubtitle>

            <CodeSnippet code={cliCode} language="bash" />

            <Divider />

            <ConnectionVerifier baseUrl={resolveBaseUrl(state)} />
        </StepContainer>
    );
}

const StepContainer = styled.div`
    position: relative;
    animation: fadeIn 0.3s ease-in-out;
    max-width: 560px;
    margin: 0 auto;
    overflow: hidden;

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;

const CenterContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    gap: 12px;
    text-align: center;
`;

const SpinningLoader = styled(Loader2)`
    color: hsl(var(--primary));
    animation: spin 1s linear infinite;
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const LoadingTitle = styled.h3`
    font-size: 18px;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0;
`;

const LoadingSubtitle = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const ErrorTitle = styled.h3`
    font-size: 18px;
    font-weight: 700;
    color: #f87171;
    margin: 0;
`;

const ErrorMessage = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 400px;
`;

const RetryButton = styled.button`
    margin-top: 8px;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--primary-foreground));
    background-color: hsl(var(--primary));
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
        background-color: hsl(var(--primary) / 0.85);
    }
`;

const SuccessBanner = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    background-color: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 10px;
    color: #34d399;
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 28px;
`;

const SectionTitle = styled.h3`
    font-size: 14px;
    font-weight: 700;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 12px;
`;

const SectionSubtitle = styled.p`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    margin: 0 0 12px;
`;

const CredentialRow = styled.div`
    margin-bottom: 16px;
`;

const CredentialLabel = styled.label`
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    margin-bottom: 6px;
`;

const CredentialValue = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background-color: hsl(var(--accent));
    border: 1px solid var(--border-light);
    border-radius: 8px;
`;

const CredentialText = styled.span<{ $mono?: boolean }>`
    flex: 1;
    font-size: 13px;
    color: #e2e8f0;
    font-family: ${props => props.$mono
        ? "'SF Mono', 'Fira Code', Menlo, Consolas, monospace"
        : 'inherit'};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const IconButton = styled.button`
    padding: 4px;
    background: transparent;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
    flex-shrink: 0;

    &:hover {
        color: hsl(var(--foreground));
        background-color: var(--overlay-medium);
    }
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid var(--overlay-light);
    margin: 24px 0;
`;
