import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { createApplication, updateApplication } from '../../../services/applications';
import type { ApplicationConfig } from '../../../types/application.types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    appToEdit?: ApplicationConfig | null;
}

type TransportType = 'StreamableHTTP' | 'SSE' | 'WebSocket' | 'STDIO';

// Maps UI transport IDs to the values expected by mapConfigToApi / the backend
const TRANSPORT_API_VALUE: Record<TransportType, string> = {
    StreamableHTTP: 'streamable_http',
    SSE: 'sse',
    WebSocket: 'websocket',
    STDIO: 'stdio',
};

interface Transport {
    id: TransportType;
    label: string;
    icon: string;
    description: string;
    fields: Field[];
}

interface Field {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    placeholder?: string;
    required?: boolean;
}

const TRANSPORTS: Transport[] = [
    {
        id: 'StreamableHTTP',
        label: 'Streamable HTTP',
        icon: '🌐',
        description: 'Modern HTTP-based transport with streaming',
        fields: [
            { key: 'url', label: 'Server URL', type: 'url', placeholder: 'https://mcp.example.com/mcp', required: true },
            { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Bearer token or API key' },
        ],
    },
    {
        id: 'SSE',
        label: 'SSE',
        icon: '📡',
        description: 'Server-Sent Events transport',
        fields: [
            { key: 'url', label: 'SSE Endpoint', type: 'url', placeholder: 'https://mcp.example.com/sse', required: true },
            { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Bearer token or API key' },
        ],
    },
    {
        id: 'WebSocket',
        label: 'WebSocket',
        icon: '🔌',
        description: 'WebSocket-based bidirectional transport',
        fields: [
            { key: 'url', label: 'WebSocket URL', type: 'url', placeholder: 'wss://mcp.example.com/ws', required: true },
            { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Bearer token or API key' },
        ],
    },
    {
        id: 'STDIO',
        label: 'STDIO',
        icon: '⌨️',
        description: 'Standard I/O process-based transport',
        fields: [
            { key: 'command', label: 'Command', type: 'text', placeholder: 'npx -y @modelcontextprotocol/server-everything', required: true },
            { key: 'args', label: 'Arguments (JSON array)', type: 'text', placeholder: '["--flag", "value"]' },
            { key: 'env', label: 'Environment (JSON object)', type: 'text', placeholder: '{"KEY": "value"}' },
        ],
    },
];

const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Modal = styled.div`
    background: var(--color-surface, #1a1a2e);
    border-radius: 16px;
    width: 820px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
`;

const Sidebar = styled.div`
    width: 220px;
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.25);
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    padding: 24px 12px;
    overflow-y: auto;
`;

const SidebarTitle = styled.p`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted, #888);
    margin: 0 0 12px 8px;
`;

const TransportBtn = styled.button<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid ${p => p.$selected ? 'var(--color-primary, #6c63ff)' : 'transparent'};
    background: ${p => p.$selected ? 'rgba(108, 99, 255, 0.15)' : 'transparent'};
    color: ${p => p.$selected ? 'var(--color-primary, #6c63ff)' : 'var(--color-text-secondary, #ccc)'};
    font-size: 14px;
    font-weight: ${p => p.$selected ? 600 : 400};
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    margin-bottom: 4px;

    &:hover {
        background: rgba(255, 255, 255, 0.06);
        color: white;
    }
`;

const TransportIcon = styled.span`
    font-size: 18px;
    line-height: 1;
`;

const RightPanel = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const PanelHeader = styled.div`
    padding: 24px 28px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const PanelTitle = styled.h2`
    font-size: 18px;
    font-weight: 700;
    color: white;
    margin: 0;
`;

const CloseBtn = styled.button`
    background: rgba(255, 255, 255, 0.08);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    color: white;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.15); }
`;

const FormBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 28px;
`;

const TransportDescription = styled.p`
    font-size: 13px;
    color: var(--color-text-muted, #888);
    margin: 0 0 24px;
`;

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const Label = styled.label`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary, #ccc);
    margin-bottom: 8px;
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;

    &::placeholder { color: rgba(255, 255, 255, 0.3); }
    &:focus { border-color: var(--color-primary, #6c63ff); }
`;

const NameField = styled(FieldGroup)`
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    margin-bottom: 24px;
`;

const ErrorMsg = styled.p`
    font-size: 13px;
    color: #f87171;
    margin: 0 0 16px;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.1);
    border-radius: 8px;
    border: 1px solid rgba(248, 113, 113, 0.2);
`;

const Footer = styled.div`
    padding: 20px 28px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
`;

const CancelBtn = styled.button`
    padding: 10px 20px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: var(--color-text-secondary, #ccc);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.06); color: white; }
`;

const SubmitBtn = styled.button`
    padding: 10px 24px;
    background: var(--color-primary, #6c63ff);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;

    &:disabled { opacity: 0.5; cursor: not-allowed; }
    &:hover:not(:disabled) { opacity: 0.9; }
`;

const Spinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

const LoadingOverlay = styled.div`
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    z-index: 10;
`;

const BigSpinner = styled.div`
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--color-primary, #6c63ff);
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

const CreateMcpModal: React.FC<Props> = ({ isOpen, onClose, onCreated, appToEdit }) => {
    const [selectedTransport, setSelectedTransport] = useState<TransportType>('StreamableHTTP');
    const [serverName, setServerName] = useState('');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && appToEdit) {
            setServerName(appToEdit.name ?? '');
            // Recover transport from stored config.transport (API format) or fall back to StreamableHTTP
            const apiTransport = (appToEdit.config as Record<string, unknown>)?.transport as string | undefined;
            const reverseMap: Record<string, TransportType> = {
                streamable_http: 'StreamableHTTP',
                sse: 'SSE',
                websocket: 'WebSocket',
                stdio: 'STDIO',
            };
            setSelectedTransport(reverseMap[apiTransport ?? ''] ?? 'StreamableHTTP');
            const cfg = appToEdit.config as Record<string, unknown> ?? {};
            const strCfg: Record<string, string> = {};
            for (const k in cfg) {
                const v = cfg[k];
                strCfg[k] = typeof v === 'string' ? v : JSON.stringify(v);
            }
            setFormValues(strCfg);
        } else if (isOpen) {
            setServerName('');
            setSelectedTransport('StreamableHTTP');
            setFormValues({});
            setErrorMessage(null);
        }
    }, [isOpen, appToEdit]);

    if (!isOpen) return null;

    const transport = TRANSPORTS.find(t => t.id === selectedTransport)!;

    const handleSelectTransport = (id: TransportType) => {
        setSelectedTransport(id);
        setFormValues({});
        setErrorMessage(null);
    };

    const handleChange = (key: string, value: string) => {
        setFormValues(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!serverName.trim()) {
            setErrorMessage('Server name is required');
            return;
        }

        const missing = transport.fields.filter(f => f.required && !formValues[f.key]?.trim());
        if (missing.length > 0) {
            setErrorMessage(`Required: ${missing.map(f => f.label).join(', ')}`);
            return;
        }

        setIsLoading(true);
        setErrorMessage(null);
        try {
            // Include the transport in config so mapConfigToApi routes correctly.
            // api_key for HTTP transports is sent as an Authorization header.
            const config: Record<string, string> = {
                ...formValues,
                transport: TRANSPORT_API_VALUE[selectedTransport],
            };
            if (config.api_key && selectedTransport !== 'STDIO') {
                config.headers = JSON.stringify({ Authorization: `Bearer ${config.api_key}` });
                delete config.api_key;
            }

            const payload = {
                name: serverName.trim(),
                type: 'MCPServer' as ApplicationConfig['type'],
                category: 'MCP' as const,
                config,
            };

            if (appToEdit?.id) {
                await updateApplication(appToEdit.id, payload);
            } else {
                await createApplication(payload);
            }
            onCreated();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to save MCP server';
            setErrorMessage(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <Modal>
                {isLoading && <LoadingOverlay><BigSpinner /></LoadingOverlay>}

                <Sidebar>
                    <SidebarTitle>Transport</SidebarTitle>
                    {TRANSPORTS.map(t => {
                        const isSel = selectedTransport === t.id;
                        return (
                            <TransportBtn
                                key={t.id}
                                type="button"
                                $selected={isSel}
                                onClick={(e) => { e.stopPropagation(); handleSelectTransport(t.id); }}
                            >
                                <TransportIcon>{t.icon}</TransportIcon>
                                {t.label}
                            </TransportBtn>
                        );
                    })}
                </Sidebar>

                <RightPanel>
                    <PanelHeader>
                        <PanelTitle>{appToEdit ? 'Edit MCP Server' : 'Add MCP Server'}</PanelTitle>
                        <CloseBtn type="button" onClick={onClose}>×</CloseBtn>
                    </PanelHeader>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        <FormBody>
                            {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                            <NameField>
                                <Label htmlFor="server-name">
                                    Server Name <span style={{ color: '#f87171' }}>*</span>
                                </Label>
                                <Input
                                    id="server-name"
                                    type="text"
                                    placeholder="My MCP Server"
                                    value={serverName}
                                    onChange={e => setServerName(e.target.value)}
                                />
                            </NameField>

                            <TransportDescription>{transport.description}</TransportDescription>

                            {transport.fields.map(field => (
                                <FieldGroup key={field.key}>
                                    <Label htmlFor={field.key}>
                                        {field.label}{field.required && <span style={{ color: '#f87171' }}> *</span>}
                                    </Label>
                                    <Input
                                        id={field.key}
                                        type={field.type}
                                        placeholder={field.placeholder}
                                        value={formValues[field.key] ?? ''}
                                        onChange={e => handleChange(field.key, e.target.value)}
                                    />
                                </FieldGroup>
                            ))}
                        </FormBody>

                        <Footer>
                            <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                            <SubmitBtn type="submit" disabled={isLoading}>
                                {isLoading && <Spinner />}
                                {appToEdit ? 'Save Changes' : 'Add Server'}
                            </SubmitBtn>
                        </Footer>
                    </form>
                </RightPanel>
            </Modal>
        </Overlay>
    );
};

export default CreateMcpModal;
