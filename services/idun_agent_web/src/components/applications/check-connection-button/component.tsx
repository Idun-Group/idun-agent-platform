import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { ConnectionCheckResponse } from '../../../services/applications';

interface Props {
    onCheck: () => Promise<ConnectionCheckResponse>;
    disabled?: boolean;
}

type Status = 'idle' | 'checking' | 'success' | 'failed';

const RESET_DELAY_MS = 5000;

export default function CheckConnectionButton({ onCheck, disabled }: Props) {
    const [status, setStatus] = useState<Status>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (status !== 'success' && status !== 'failed') return;
        const timer = setTimeout(() => setStatus('idle'), RESET_DELAY_MS);
        return () => clearTimeout(timer);
    }, [status]);

    const handleClick = async () => {
        setStatus('checking');
        setMessage('');
        try {
            const result = await onCheck();
            setStatus(result.success ? 'success' : 'failed');
            setMessage(result.message);
        } catch {
            setStatus('failed');
            setMessage('Connection check request failed');
        }
    };

    return (
        <Container>
            <Button onClick={handleClick} disabled={disabled || status === 'checking'} type="button">
                {status === 'checking' ? (
                    <><SpinningLoader size={14} /> Checking...</>
                ) : (
                    <><Wifi size={14} /> Check Connection</>
                )}
            </Button>
            {status === 'success' && (
                <StatusMessage $variant="success">
                    <Wifi size={12} /> {message}
                </StatusMessage>
            )}
            {status === 'failed' && (
                <StatusMessage $variant="error">
                    <WifiOff size={12} /> {message}
                </StatusMessage>
            )}
        </Container>
    );
}

const Container = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const Button = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    color: #e1e4e8;
    background-color: rgba(12, 92, 171, 0.15);
    border: 1px solid rgba(12, 92, 171, 0.3);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
        background-color: rgba(12, 92, 171, 0.25);
        border-color: #0C5CAB;
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

const StatusMessage = styled.span<{ $variant: 'success' | 'error' }>`
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 500;
    ${props => props.$variant === 'success' ? `color: #34d399;` : `color: #f87171;`}
`;
