import { useState, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface ConnectionVerifierProps {
    baseUrl: string;
}

type Status = 'idle' | 'checking' | 'connected' | 'failed';

export default function ConnectionVerifier({ baseUrl }: ConnectionVerifierProps) {
    const [status, setStatus] = useState<Status>('idle');
    const abortRef = useRef<AbortController | null>(null);

    const verify = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setStatus('checking');

        const healthUrl = baseUrl.endsWith('/')
            ? `${baseUrl}health`
            : `${baseUrl}/health`;

        const MAX_ATTEMPTS = 10;
        const INTERVAL_MS = 3000;

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            if (controller.signal.aborted) return;

            try {
                const response = await fetch(healthUrl, {
                    signal: controller.signal,
                    mode: 'cors',
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'healthy') {
                        setStatus('connected');
                        return;
                    }
                }
            } catch {
                // Network error or CORS — continue polling
            }

            if (i < MAX_ATTEMPTS - 1) {
                await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
            }
        }

        if (!controller.signal.aborted) {
            setStatus('failed');
        }
    }, [baseUrl]);

    return (
        <Container>
            <VerifyButton onClick={verify} disabled={status === 'checking'} type="button">
                {status === 'checking' ? (
                    <><SpinningLoader size={16} /> Checking connection...</>
                ) : (
                    <><Wifi size={16} /> Verify Connection</>
                )}
            </VerifyButton>

            {status === 'connected' && (
                <StatusMessage $variant="success">
                    <Wifi size={14} />
                    Agent is connected and healthy!
                </StatusMessage>
            )}

            {status === 'failed' && (
                <StatusMessage $variant="error">
                    <WifiOff size={14} />
                    Could not reach the agent. Make sure it is running at {baseUrl}
                </StatusMessage>
            )}
        </Container>
    );
}

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const VerifyButton = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 600;
    color: white;
    background-color: rgba(140, 82, 255, 0.15);
    border: 1px solid rgba(140, 82, 255, 0.3);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    align-self: flex-start;

    &:hover:not(:disabled) {
        background-color: rgba(140, 82, 255, 0.25);
        border-color: #8c52ff;
    }

    &:disabled {
        opacity: 0.7;
        cursor: wait;
    }
`;

const SpinningLoader = styled(Loader2)`
    animation: spin 1s linear infinite;
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const StatusMessage = styled.div<{ $variant: 'success' | 'error' }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;

    ${props => props.$variant === 'success' ? `
        background-color: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: #34d399;
    ` : `
        background-color: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #f87171;
    `}
`;
