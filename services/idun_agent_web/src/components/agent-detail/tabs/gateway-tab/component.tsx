import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import type { BackendAgent } from '../../../../services/agents';
import {
    Terminal,
    Key,
    Copy,
    ChevronDown,
    Loader2,
    Eye,
    EyeOff,
    ExternalLink,
} from 'lucide-react';
import { getJson } from '../../../../utils/api';
import { agentFetch, buildAgentUrl } from '../../../../utils/agent-fetch';

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
    background-color: hsl(var(--background));
    overflow-y: auto;
`;

const Card = styled.div`
    background-color: hsl(var(--card));
    border: 1px solid var(--overlay-light);
    border-radius: 12px;
`;

const CardHeader = styled.div`
    padding: 24px;
    border-bottom: 1px solid var(--overlay-light);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const CardTitleIcon = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;

    h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: hsl(var(--foreground));
    }
`;

const DocsLink = styled.a`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(99, 179, 237, 0.08);
    border: 1px solid rgba(99, 179, 237, 0.25);
    border-radius: 8px;
    color: #63b3ed;
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.15s;

    &:hover { background: rgba(99, 179, 237, 0.18); }
`;

const CardContent = styled.div`
    padding: 24px;
`;

const Section = styled.div`
    margin-bottom: 24px;
    &:last-child { margin-bottom: 0; }
`;

const Label = styled.label`
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    margin-bottom: 8px;
`;

const InputGroup = styled.div`
    display: flex;
    align-items: center;
    background-color: hsl(var(--accent));
    border: 1px solid var(--border-light);
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
    border-left: 1px solid var(--border-light);
    padding: 12px 16px;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    position: relative;

    &:hover {
        color: hsl(var(--foreground));
        background-color: var(--overlay-light);
    }
`;

const CopiedTooltip = styled.div`
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background-color: rgba(0, 0, 0, 0.9);
    color: hsl(var(--foreground));
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
    color: hsl(var(--primary));
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
    background-color: hsl(var(--card));
    border: 1px solid var(--overlay-light);
    border-radius: 8px;
    overflow: hidden;
`;

const EndpointHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    cursor: pointer;
    &:hover { background-color: var(--overlay-light); }
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
            default: return `background: rgba(107, 114, 128, 0.1); color: hsl(var(--muted-foreground)); border-color: rgba(107, 114, 128, 0.2);`;
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
    background-color: hsl(var(--accent));
    border-top: 1px solid var(--overlay-light);
    animation: ${fadeIn} 0.2s ease-out;
`;

const Description = styled.p`
    font-size: 12px;
    color: hsl(var(--text-secondary));
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
    color: hsl(var(--text-tertiary));
    text-transform: uppercase;
    margin-bottom: 6px;
`;

const CodeSnippet = styled.div`
    background-color: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    color: hsl(var(--primary));
    font-family: monospace;
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;

    pre {
        margin: 0;
        color: hsl(var(--muted-foreground));
        white-space: pre-wrap;
        overflow-x: auto;
    }
`;


const ParamTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
`;

const ParamTh = styled.th`
    text-align: left;
    padding: 6px 8px;
    color: hsl(var(--text-tertiary));
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-light);
`;

const ParamTd = styled.td`
    padding: 6px 8px;
    color: hsl(var(--text-secondary));
    border-bottom: 1px solid var(--overlay-light);
    vertical-align: top;
`;

const ParamName = styled.code`
    font-family: monospace;
    color: hsl(var(--primary));
    font-size: 12px;
`;

const InBadge = styled.span`
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--overlay-light);
    color: hsl(var(--muted-foreground));
    border: 1px solid var(--border-light);
`;

const RequiredBadge = styled.span`
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.2);
`;

const CurlBlock = styled.div`
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    padding: 12px 12px 12px 12px;
    position: relative;

    pre {
        margin: 0;
        font-family: monospace;
        font-size: 12px;
        color: hsl(var(--muted-foreground));
        white-space: pre-wrap;
        word-break: break-all;
        line-height: 1.6;
        padding-right: 56px;
    }
`;

const CurlCopyBtn = styled.button`
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    padding: 3px 6px;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;

    &:hover { color: hsl(var(--foreground)); background: var(--overlay-medium); }
`;

const LoadingSpinner = styled(Loader2)`
    animation: ${spin} 1s linear infinite;
`;

// --- Interfaces ---
interface ParamDef {
    name: string;
    in: string;
    required: boolean;
    description?: string;
    type?: string;
}

interface RouteItem {
    id: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | string;
    path: string;
    title: string;
    description?: string;
    parameters: ParamDef[];
    requestBodySchema?: Record<string, any> | null;
    requestBodyExample?: Record<string, unknown> | null;
}

// --- Helpers ---
const resolveSchema = (schema: any, components: Record<string, any>): any => {
    if (!schema) return null;
    if (schema['$ref']) {
        const refName = schema['$ref'].split('/').pop() as string;
        return components[refName] ?? schema;
    }
    return schema;
};

const generateExampleFromSchema = (
    schema: any,
    components: Record<string, any> = {},
): Record<string, unknown> | null => {
    const resolved = resolveSchema(schema, components);
    if (!resolved) return null;
    if (resolved.example) return resolved.example;
    if (resolved.type === 'object' && resolved.properties) {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(resolved.properties as Record<string, any>)) {
            const resolvedVal = resolveSchema(val, components);
            if (!resolvedVal) { result[key] = null; continue; }
            if (resolvedVal.example !== undefined) result[key] = resolvedVal.example;
            else if (resolvedVal.type === 'string') result[key] = resolvedVal.default ?? `<${key}>`;
            else if (resolvedVal.type === 'integer' || resolvedVal.type === 'number') result[key] = resolvedVal.default ?? 0;
            else if (resolvedVal.type === 'boolean') result[key] = resolvedVal.default ?? false;
            else if (resolvedVal.type === 'array') result[key] = [];
            else result[key] = null;
        }
        return result;
    }
    return null;
};

const buildCurlCommand = (
    method: string,
    url: string,
    authToken: string | null,
    body: Record<string, unknown> | null,
    queryParams: ParamDef[],
): string => {
    let fullUrl = url;
    if (queryParams.length > 0) {
        const qs = queryParams.map(p => `${p.name}=<${p.name}>`).join('&');
        fullUrl = `${url}?${qs}`;
    }
    const parts = [`curl -X ${method} "${fullUrl}"`];
    const authVal = authToken ? `Bearer ${authToken}` : 'Bearer <your-api-key>';
    parts.push(`  -H "Authorization: ${authVal}"`);
    if (body) {
        parts.push(`  -H "Content-Type: application/json"`);
        parts.push(`  -d '${JSON.stringify(body, null, 2)}'`);
    }
    return parts.join(' \\\n');
};

// --- Main Component ---
const GatewayTab: React.FC<{ agent?: BackendAgent | null }> = ({ agent }) => {
    const [routes, setRoutes] = useState<RouteItem[]>([]);
    const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

    // Auth Token State
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [showAuthToken, setShowAuthToken] = useState(false);
    const [isTokenCopied, setIsTokenCopied] = useState(false);

    const baseUrl = agent?.base_url || `https://api.idun.ai/v1/agents/${agent?.id || '{agent_id}'}/invoke`;

    useEffect(() => {
        if (agent?.base_url) {
            agentFetch(buildAgentUrl(agent.base_url, '/openapi.json'))
                .then(res => res.json())
                .then(data => {
                    if (data && data.paths) {
                        const components: Record<string, any> = data.components?.schemas ?? {};
                        const newRoutes: RouteItem[] = [];
                        let idCounter = 1;
                        Object.entries(data.paths).forEach(([path, methods]: [string, any]) => {
                            Object.entries(methods).forEach(([method, details]: [string, any]) => {
                                const parameters: ParamDef[] = (details.parameters ?? []).map((p: any) => ({
                                    name: p.name,
                                    in: p.in,
                                    required: p.required ?? false,
                                    description: p.description,
                                    type: p.schema?.type,
                                }));
                                const rbContent = details.requestBody?.content?.['application/json'];
                                const rawSchema = rbContent?.schema ?? null;
                                // Resolve $ref to the actual schema definition
                                const requestBodySchema = rawSchema ? resolveSchema(rawSchema, components) : null;
                                const requestBodyExample =
                                    rbContent?.example ??
                                    requestBodySchema?.example ??
                                    generateExampleFromSchema(requestBodySchema, components) ??
                                    null;
                                newRoutes.push({
                                    id: `auto-${idCounter++}`,
                                    method: method.toUpperCase(),
                                    path,
                                    title: details.summary || details.operationId || 'Endpoint',
                                    description: details.description || '',
                                    parameters,
                                    requestBodySchema,
                                    requestBodyExample,
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

    return (
        <Container>
            <Card>
                        <CardHeader>
                            <CardTitleIcon>
                                <Terminal size={18} color="hsl(var(--primary))" />
                                <h3>Endpoint Details</h3>
                            </CardTitleIcon>
                            {agent?.base_url && (
                                <DocsLink
                                    href={`${agent.base_url}/docs`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <ExternalLink size={13} />
                                    View Docs
                                </DocsLink>
                            )}
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
                                            style={{ borderLeft: '1px solid var(--border-light)' }}
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

                            <Section style={{ borderTop: '1px solid var(--overlay-light)', paddingTop: '24px', marginTop: '24px' }}>
                                <Label style={{ marginBottom: '16px' }}>Available Endpoints</Label>

                                <EndpointsList>
                                    {routes.map((ep) => (
                                        <EndpointItem key={ep.id}>
                                            <EndpointHeader onClick={() => setExpandedEndpoint(expandedEndpoint === ep.id ? null : ep.id)}>
                                                <EndpointMeta>
                                                    <MethodBadge $method={ep.method}>{ep.method}</MethodBadge>
                                                    <EndpointPath>{ep.path}</EndpointPath>
                                                </EndpointMeta>
                                                                <ChevronDown size={14} style={{ transform: expandedEndpoint === ep.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'hsl(var(--text-secondary))' }} />
                                            </EndpointHeader>

                                            {expandedEndpoint === ep.id && (
                                                <EndpointDetails>
                                                    {ep.description && <Description>{ep.description}</Description>}

                                                    {/* Endpoint URL */}
                                                    <DetailSection>
                                                        <SubLabel>Endpoint URL</SubLabel>
                                                        <CodeSnippet>
                                                            <code>{agent?.base_url}{ep.path}</code>
                                                            <Copy size={12} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => navigator.clipboard.writeText(`${agent?.base_url}${ep.path}`)} />
                                                        </CodeSnippet>
                                                    </DetailSection>

                                                    {/* Parameters */}
                                                    {ep.parameters.length > 0 && (
                                                        <DetailSection>
                                                            <SubLabel>Parameters</SubLabel>
                                                            <ParamTable>
                                                                <thead>
                                                                    <tr>
                                                                        <ParamTh>Name</ParamTh>
                                                                        <ParamTh>In</ParamTh>
                                                                        <ParamTh>Type</ParamTh>
                                                                        <ParamTh>Required</ParamTh>
                                                                        <ParamTh>Description</ParamTh>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {ep.parameters.map(p => (
                                                                        <tr key={p.name}>
                                                                            <ParamTd><ParamName>{p.name}</ParamName></ParamTd>
                                                                            <ParamTd><InBadge>{p.in}</InBadge></ParamTd>
                                                                            <ParamTd style={{ color: '#fbbf24' }}>{p.type ?? '—'}</ParamTd>
                                                                            <ParamTd>{p.required ? <RequiredBadge>required</RequiredBadge> : '—'}</ParamTd>
                                                                            <ParamTd>{p.description ?? '—'}</ParamTd>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </ParamTable>
                                                        </DetailSection>
                                                    )}

                                                    {/* Request body schema */}
                                                    {ep.requestBodySchema && (
                                                        <DetailSection>
                                                            <SubLabel>Request Body Schema</SubLabel>
                                                            <CodeSnippet>
                                                                <pre>{JSON.stringify(ep.requestBodySchema, null, 2)}</pre>
                                                            </CodeSnippet>
                                                        </DetailSection>
                                                    )}

                                                    {/* cURL Example */}
                                                    <DetailSection>
                                                        <SubLabel>cURL Example</SubLabel>
                                                        <CurlBlock>
                                                            <pre>{buildCurlCommand(
                                                                ep.method,
                                                                `${agent?.base_url}${ep.path}`,
                                                                authToken,
                                                                ep.requestBodyExample ?? null,
                                                                ep.parameters.filter(p => p.in === 'query'),
                                                            )}</pre>
                                                            <CurlCopyBtn onClick={() => navigator.clipboard.writeText(buildCurlCommand(
                                                                ep.method,
                                                                `${agent?.base_url}${ep.path}`,
                                                                authToken,
                                                                ep.requestBodyExample ?? null,
                                                                ep.parameters.filter(p => p.in === 'query'),
                                                            ))}>
                                                                <Copy size={10} /> Copy
                                                            </CurlCopyBtn>
                                                        </CurlBlock>
                                                    </DetailSection>
                                                </EndpointDetails>
                                            )}
                                        </EndpointItem>
                                    ))}
                                </EndpointsList>
                            </Section>
                        </CardContent>
            </Card>
        </Container>
    );
};

export default GatewayTab;
