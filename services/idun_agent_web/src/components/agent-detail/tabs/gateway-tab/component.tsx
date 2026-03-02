import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import type { BackendAgent } from '../../../../services/agents';
import {
    Terminal,
    Key,
    Copy,
    ChevronDown,
    Plus,
    Trash2,
    Power,
    Loader2,
    Eye,
    EyeOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getJson } from '../../../../utils/api';
import {
    FormSelect,
    FormTextArea,
    TextInput,
} from '../../../general/form/component';

// --- Keyframes for Animations ---
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

// --- Styled Components (Layout) ---
const Container = styled.div`
    flex: 1;
    padding: 24px;
    background-color: #0f1016;
    height: 100%;
    overflow-y: auto;
`;

const Card = styled.div`
    background-color: #0B0A15;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

const CardHeader = styled.div`
    padding: 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    flex-shrink: 0;
`;

const CardTitleIcon = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;

    h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: white;
    }
`;

const CardContent = styled.div`
    padding: 24px;
    flex: 1;
    overflow-y: auto;
`;

const Section = styled.div`
    margin-bottom: 24px;
    &:last-child { margin-bottom: 0; }
`;

const Label = styled.label`
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #9ca3af;
    text-transform: uppercase;
    margin-bottom: 8px;
`;

const InputGroup = styled.div`
    display: flex;
    align-items: center;
    background-color: #05040a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
`;

const CodeBlock = styled.code`
    flex: 1;
    padding: 12px 16px;
    font-size: 14px;
    color: #4ade80;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const CopyButton = styled.button`
    background: transparent;
    border: none;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    padding: 12px 16px;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    position: relative;

    &:hover {
        color: white;
        background-color: rgba(255, 255, 255, 0.05);
    }
`;

const CopiedTooltip = styled.div`
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background-color: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    animation: ${fadeIn} 0.2s ease-out;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);

    &::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        margin-left: -4px;
        border-width: 4px;
        border-style: solid;
        border-color: rgba(0, 0, 0, 0.9) transparent transparent transparent;
    }
`;

const AuthBlock = styled.div`
    flex: 1;
    display: flex;
    align-items: center;
    padding: 12px 16px;
    font-size: 14px;
    color: #d1d5db;
    overflow: hidden;
`;

const TokenText = styled.span`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-right: 8px;
`;

const ActionButton = styled.button`
    font-size: 12px;
    font-weight: 500;
    color: #8c52ff;
    background: none;
    border: none;
    padding: 0 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    &:hover { color: #a78bfa; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EndpointsList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const EndpointItem = styled.div`
    background-color: #0B0A15;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    overflow: hidden;
`;

const EndpointHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    cursor: pointer;
    &:hover { background-color: rgba(255, 255, 255, 0.05); }
`;

const EndpointMeta = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    overflow: hidden;
`;

const MethodBadge = styled.span<{ $method: string }>`
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid;
    ${props => {
        switch (props.$method) {
            case 'POST': return 'background: rgba(59, 130, 246, 0.1); color: #60a5fa; border-color: rgba(59, 130, 246, 0.2);';
            case 'GET': return 'background: rgba(16, 185, 129, 0.1); color: #34d399; border-color: rgba(16, 185, 129, 0.2);';
            case 'DELETE': return 'background: rgba(239, 68, 68, 0.1); color: #f87171; border-color: rgba(239, 68, 68, 0.2);';
            case 'PUT': return 'background: rgba(245, 158, 11, 0.1); color: #fbbf24; border-color: rgba(245, 158, 11, 0.2);';
            default: return 'background: rgba(107, 114, 128, 0.1); color: #9ca3af; border-color: rgba(107, 114, 128, 0.2);';
        }
    }}
`;

const EndpointPath = styled.code`
    font-size: 14px;
    color: #d1d5db;
    font-family: monospace;
`;

const EndpointDetails = styled.div`
    padding: 12px;
    background-color: #05040a;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    animation: ${fadeIn} 0.2s ease-out;
`;

const Description = styled.p`
    font-size: 12px;
    color: #6b7280;
    margin: 0 0 12px 0;
`;

const DetailSection = styled.div`
    margin-bottom: 12px;
    &:last-child { margin-bottom: 0; }
`;

const SubLabel = styled.label`
    display: block;
    font-size: 10px;
    font-weight: 600;
    color: #4b5563;
    text-transform: uppercase;
    margin-bottom: 6px;
`;

const CodeSnippet = styled.div`
    background-color: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    color: #8c52ff;
    font-family: monospace;
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;

    pre {
        margin: 0;
        color: #9ca3af;
        white-space: pre-wrap;
        overflow-x: auto;
    }
`;

const AddButton = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 12px;
    color: #8c52ff;
    background: rgba(140, 82, 255, 0.1);
    border: 1px solid rgba(140, 82, 255, 0.2);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover { background: rgba(140, 82, 255, 0.2); }
`;

const InactiveBadge = styled.span`
    font-size: 10px;
    color: #9ca3af;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
`;

const RouteActions = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);

    button {
        background: none;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 4px;
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        &:hover { background: rgba(255,255,255,0.05); }
    }
`;

const ModalOverlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
`;

const ModalContent = styled.div`
    width: 480px;
    background: #0f1016;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
`;

const ModalHeader = styled.div`
    margin-bottom: 20px;
    h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: white;
    }
`;

const ModalButton = styled.button<{ $primary?: boolean }>`
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    border: none;
    transition: all 0.2s;

    ${props => props.$primary
        ? `background-color: #8c52ff; color: white; &:hover { background-color: #7c3aed; }`
        : `background-color: transparent; color: #9ca3af; &:hover { color: white; background-color: rgba(255, 255, 255, 0.05); }`
    }
`;

const LoadingSpinner = styled(Loader2)`
    animation: ${spin} 1s linear infinite;
`;

// --- Interfaces ---
interface RouteItem {
    id: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | string;
    path: string;
    title: string;
    description?: string;
    active: boolean;
    payload?: any;
}

// --- Main Component Helpers ---
type NewRouteFormProps = {
    onCancel: () => void;
    onCreate: (data: Omit<RouteItem, 'id'>) => void;
};

const NewRouteForm: React.FC<NewRouteFormProps> = ({ onCancel, onCreate }) => {
    const [method, setMethod] = useState<string>('GET');
    const [path, setPath] = useState<string>('');
    const [title, setTitle] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [active, setActive] = useState<boolean>(true);
    const { t } = useTranslation();

    return (
        <div>
            <div style={{ marginBottom: '12px' }}>
                <FormSelect
                    label={t('gateway.field.method', 'Method')}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                </FormSelect>
            </div>
            <div style={{ marginBottom: '12px' }}>
                <TextInput
                    label={t('gateway.field.path', 'Path')}
                    placeholder="/api/v1/new-route"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                />
            </div>
            <div style={{ marginBottom: '12px' }}>
                <TextInput
                    label={t('gateway.field.title', 'Title')}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
            </div>
            <div style={{ marginBottom: '12px' }}>
                <FormTextArea
                    label={t('gateway.field.description', 'Description')}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <ModalButton onClick={onCancel}>
                    {t('gateway.cancel', 'Cancel')}
                </ModalButton>
                <ModalButton
                    $primary
                    onClick={() =>
                        onCreate({
                            method: method as any,
                            path,
                            title,
                            description,
                            active,
                        })
                    }
                >
                    {t('gateway.create', 'Create')}
                </ModalButton>
            </div>
        </div>
    );
};

// --- Main Component ---
const GatewayTab: React.FC<{ agent?: BackendAgent | null }> = ({ agent }) => {
    const [routes, setRoutes] = useState<RouteItem[]>([]);
    const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { t } = useTranslation();

    // Auth Token State
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [showAuthToken, setShowAuthToken] = useState(false);
    const [isTokenCopied, setIsTokenCopied] = useState(false);

    const baseUrl = agent?.base_url || `https://api.idun.ai/v1/agents/${agent?.id || '{agent_id}'}/invoke`;

    useEffect(() => {
        if (agent?.base_url) {
            fetch(`${agent.base_url}/openapi.json`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.paths) {
                        const newRoutes: RouteItem[] = [];
                        let idCounter = 1;
                        Object.entries(data.paths).forEach(([path, methods]: [string, any]) => {
                            Object.entries(methods).forEach(([method, details]: [string, any]) => {
                                newRoutes.push({
                                    id: `auto-${idCounter++}`,
                                    method: method.toUpperCase(),
                                    path: path,
                                    title: details.summary || details.operationId || 'Endpoint',
                                    description: details.description || '',
                                    active: true,
                                    payload: details.requestBody?.content?.['application/json']?.schema?.example || null
                                });
                            });
                        });
                        setRoutes(newRoutes);
                    }
                })
                .catch(err => console.error("Failed to fetch OpenAPI specs", err));
        }
    }, [agent?.base_url]);

    const handleFetchAuthToken = async () => {
        if (!agent?.id) return;

        setIsAuthLoading(true);
        try {
            const data = await getJson<Record<string, string>>(`/api/v1/agents/key?agent_id=${agent.id}`);
            const token = data.api_key || data.key || (typeof data === 'string' ? data : JSON.stringify(data));
            setAuthToken(token);
            setShowAuthToken(true);
        } catch (error) {
            console.error("Error fetching auth token:", error);
        } finally {
            setIsAuthLoading(false);
        }
    };

    const handleCopyToken = () => {
        if (authToken) {
            navigator.clipboard.writeText(authToken);
            setIsTokenCopied(true);
            setTimeout(() => setIsTokenCopied(false), 2000);
        }
    };

    const addRoute = (route: Omit<RouteItem, 'id'>) => {
        const newRoute: RouteItem = { ...route, id: Date.now().toString() };
        setRoutes((prev) => [newRoute, ...prev]);
    };

    return (
        <Container>
            <Card>
                        <CardHeader>
                            <CardTitleIcon>
                                <Terminal size={18} color="#8c52ff" />
                                <h3>Endpoint Details</h3>
                            </CardTitleIcon>
                        </CardHeader>

                        <CardContent>
                            <Section>
                                <Label>Base URL</Label>
                                <InputGroup>
                                    <CodeBlock>{baseUrl}</CodeBlock>
                                    <CopyButton onClick={() => navigator.clipboard.writeText(baseUrl)}>
                                        <Copy size={16} />
                                    </CopyButton>
                                </InputGroup>
                            </Section>

                            <Section>
                                <Label>Authorization</Label>
                                <InputGroup>
                                    <AuthBlock>
                                        <Key size={16} color="#eab308" style={{ marginRight: '12px', flexShrink: 0 }} />
                                        <TokenText>
                                            {authToken && showAuthToken
                                                ? authToken
                                                : "••••••••••••••••••••••••••••••••"
                                            }
                                        </TokenText>
                                    </AuthBlock>

                                    {authToken && showAuthToken && (
                                        <CopyButton
                                            onClick={handleCopyToken}
                                            style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}
                                            title="Copy Token"
                                        >
                                            <Copy size={14} />
                                            {isTokenCopied && <CopiedTooltip>Copied!</CopiedTooltip>}
                                        </CopyButton>
                                    )}

                                    <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', height: '24px' }} />

                                    <ActionButton
                                        onClick={() => {
                                            if (authToken && showAuthToken) {
                                                setShowAuthToken(false);
                                                setAuthToken(null);
                                            } else {
                                                handleFetchAuthToken();
                                            }
                                        }}
                                        disabled={isAuthLoading}
                                    >
                                        {isAuthLoading ? (
                                            <>
                                                <LoadingSpinner size={12} />
                                                <span>Fetching...</span>
                                            </>
                                        ) : (
                                            <>
                                                {authToken && showAuthToken ? (
                                                    <>
                                                        <EyeOff size={14} />
                                                        <span>Hide Key</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Eye size={14} />
                                                        <span>Show Key</span>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </ActionButton>
                                </InputGroup>
                            </Section>

                            <Section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '24px', marginTop: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <Label style={{ marginBottom: 0 }}>Available Endpoints</Label>
                                    <AddButton onClick={() => setIsModalOpen(true)}>
                                        <Plus size={12} /> Add
                                    </AddButton>
                                </div>

                                <EndpointsList>
                                    {routes.map((ep) => (
                                        <EndpointItem key={ep.id}>
                                            <EndpointHeader onClick={() => setExpandedEndpoint(expandedEndpoint === ep.id ? null : ep.id)}>
                                                <EndpointMeta>
                                                    <MethodBadge $method={ep.method}>{ep.method}</MethodBadge>
                                                    <EndpointPath>{ep.path}</EndpointPath>
                                                </EndpointMeta>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {!ep.active && <InactiveBadge>Disabled</InactiveBadge>}
                                                    <ChevronDown size={14} style={{ transform: expandedEndpoint === ep.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#6b7280' }} />
                                                </div>
                                            </EndpointHeader>

                                            {expandedEndpoint === ep.id && (
                                                <EndpointDetails>
                                                    <Description>{ep.description}</Description>

                                                    {/* Quick Actions for Route */}
                                                    <RouteActions>
                                                        <button onClick={() => {
                                                            setRoutes(prev => prev.map(r => r.id === ep.id ? { ...r, active: !r.active } : r));
                                                        }} title={ep.active ? "Disable" : "Enable"}>
                                                            <Power size={14} color={ep.active ? "#10b981" : "#ef4444"} />
                                                        </button>
                                                        <button onClick={() => {
                                                            setRoutes(prev => prev.filter(r => r.id !== ep.id));
                                                        }} title="Delete">
                                                            <Trash2 size={14} color="#ef4444" />
                                                        </button>
                                                    </RouteActions>

                                                    <DetailSection>
                                                        <SubLabel>Endpoint URL</SubLabel>
                                                        <CodeSnippet>
                                                            <code>{agent?.base_url}{ep.path}</code>
                                                            <Copy size={12} style={{ cursor: 'pointer' }} onClick={() => navigator.clipboard.writeText(`${agent?.base_url}${ep.path}`)} />
                                                        </CodeSnippet>
                                                    </DetailSection>

                                                    {ep.payload && (
                                                        <DetailSection>
                                                            <SubLabel>Payload Example</SubLabel>
                                                            <CodeSnippet>
                                                                <pre>{JSON.stringify(ep.payload, null, 2)}</pre>
                                                                <Copy size={12} style={{ cursor: 'pointer', position: 'absolute', top: '8px', right: '8px' }} onClick={() => navigator.clipboard.writeText(JSON.stringify(ep.payload, null, 2))} />
                                                            </CodeSnippet>
                                                        </DetailSection>
                                                    )}
                                                </EndpointDetails>
                                            )}
                                        </EndpointItem>
                                    ))}
                                </EndpointsList>
                            </Section>
                        </CardContent>
            </Card>

                {isModalOpen && (
                    <ModalOverlay onClick={() => setIsModalOpen(false)}>
                        <ModalContent onClick={(e) => e.stopPropagation()}>
                            <ModalHeader>
                                <h3>{t('gateway.newRoute', 'New Route')}</h3>
                            </ModalHeader>
                            <NewRouteForm
                                onCancel={() => setIsModalOpen(false)}
                                onCreate={(data) => {
                                    addRoute(data);
                                    setIsModalOpen(false);
                                }}
                            />
                        </ModalContent>
                    </ModalOverlay>
                )}
        </Container>
    );
};

export default GatewayTab;
