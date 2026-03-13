import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { Eye, EyeOff } from 'lucide-react';
import { fetchApplications, deleteApplication, discoverTools } from '../../services/applications';
import type { MCPTool } from '../../services/applications';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import type { ApplicationConfig } from '../../types/application.types';
import CreateMcpModal from '../../components/applications/create-mcp-modal/component';
import { useProject } from '../../hooks/use-project';

// ── Animations ────────────────────────────────────────────────────────────────

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;
const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;
const expandDown = keyframes`from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 600px; }`;

// ── Layout ────────────────────────────────────────────────────────────────────

const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 32px;
    gap: 24px;
    animation: ${fadeIn} 0.3s ease;
    overflow-y: auto;
`;

const PageHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
`;

const TitleBlock = styled.div``;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0 0 6px;
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const SearchBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 0 14px;
    height: 38px;
`;

const SearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: hsl(var(--foreground));
    font-size: 14px;
    width: 180px;

    &::placeholder { color: hsl(var(--muted-foreground)); }
`;

const AddButton = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 18px;
    height: 38px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 10px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;

    &:hover { opacity: 0.88; }
`;

// ── Stats Bar ─────────────────────────────────────────────────────────────────

const StatsBar = styled.div`
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
`;

const StatChip = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    font-size: 13px;
    color: hsl(var(--text-secondary));

    strong { color: hsl(var(--foreground)); font-weight: 700; }
`;

// ── Accordion List ────────────────────────────────────────────────────────────

const ServerList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const ServerCard = styled.div`
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    overflow: hidden;
    transition: border-color 0.2s;

    &:hover { border-color: hsl(var(--primary) / 0.25); }
`;

const ServerHeader = styled.button`
    width: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 20px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: hsl(var(--foreground));
`;

const ServerIcon = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;

    img {
        width: 26px;
        height: 26px;
        object-fit: contain;
    }
`;

const ServerMeta = styled.div`
    flex: 1;
    min-width: 0;
`;

const ServerName = styled.p`
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px;
`;

const ServerSubtitle = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ServerHeaderRight = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: ${p => p.$active ? 'rgba(52, 211, 153, 0.15)' : 'var(--border-subtle)'};
    color: ${p => p.$active ? '#34d399' : '#888'};
    border: 1px solid ${p => p.$active ? 'rgba(52, 211, 153, 0.3)' : 'transparent'};
`;

const TransportBadge = styled.span`
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.2);
`;

const ChevronIcon = styled.span<{ $open: boolean }>`
    font-size: 12px;
    transition: transform 0.2s;
    transform: ${p => p.$open ? 'rotate(180deg)' : 'rotate(0deg)'};
    color: hsl(var(--muted-foreground));
`;

const AccordionBody = styled.div<{ $open: boolean }>`
    display: ${p => p.$open ? 'block' : 'none'};
    animation: ${p => p.$open ? expandDown : 'none'} 0.25s ease;
    border-top: 1px solid var(--border-subtle);
    padding: 20px;
`;

const BodyGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;

    @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const SectionTitle = styled.p`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: hsl(var(--muted-foreground));
    margin: 0 0 4px;
`;

const ConfigRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const ConfigKey = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    text-transform: capitalize;
    flex-shrink: 0;
`;

const ConfigValue = styled.span`
    font-size: 12px;
    color: hsl(var(--text-secondary));
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
`;

const SecretValue = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 200px;
`;

const SecretText = styled.span`
    font-size: 12px;
    color: hsl(var(--text-secondary));
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const EyeBtn = styled.button`
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0;
    font-size: 12px;
    flex-shrink: 0;

    &:hover { color: hsl(var(--foreground)); }
`;

const DiscoverButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px 16px;
    background: hsl(var(--primary) / 0.08);
    border: 1px solid hsl(var(--primary) / 0.2);
    border-radius: 8px;
    color: hsl(var(--primary));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: hsl(var(--primary) / 0.15); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ToolList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
`;

const ToolItem = styled.div`
    padding: 10px 12px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
`;

const ToolName = styled.p`
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 2px;
    font-family: monospace;
`;

const ToolDescription = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const DiscoverError = styled.p`
    font-size: 13px;
    color: hsl(var(--destructive));
    margin: 0;
    text-align: center;
`;

const DiscoverSpinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid hsl(var(--primary) / 0.2);
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

const BodyActions = styled.div`
    display: flex;
    gap: 10px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle);
`;

const EditBtn = styled.button`
    padding: 8px 18px;
    background: var(--border-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: var(--overlay-medium); }
`;

const DeleteBtn = styled.button`
    padding: 8px 18px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 8px;
    color: hsl(var(--destructive));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(248, 113, 113, 0.18); }
`;

// ── Add server card ────────────────────────────────────────────────────────────

const AddCard = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: transparent;
    border: 2px dashed var(--border-light);
    border-radius: 14px;
    padding: 28px;
    cursor: pointer;
    transition: all 0.2s;
    color: hsl(var(--muted-foreground));
    font-size: 14px;

    &:hover {
        border-color: hsl(var(--primary));
        background: hsl(var(--primary) / 0.05);
        color: hsl(var(--primary));
    }
`;

// ── Empty / Loading ────────────────────────────────────────────────────────────

const CenterBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 80px;
    color: hsl(var(--muted-foreground));
    text-align: center;
`;

const LoadingSpinner = styled.div`
    width: 36px;
    height: 36px;
    border: 3px solid var(--border-light);
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECRET_KEYS = ['secret_key', 'secretKey', 'api_key', 'apiKey', 'password', 'token'];

const isSecretKey = (key: string) => SECRET_KEYS.some(s => key.toLowerCase().includes(s.toLowerCase()));

const flattenConfig = (config: unknown): Record<string, string> => {
    if (!config || typeof config !== 'object') return {};
    const obj = config as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const k in obj) {
        const v = obj[k];
        if (v !== null && v !== undefined && v !== '') {
            result[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
    }
    return result;
};

const getServerUrl = (config: Record<string, string>) => {
    return config.url ?? config.command ?? '';
};

// ── SecretField ───────────────────────────────────────────────────────────────

const SecretField: React.FC<{ value: string }> = ({ value }) => {
    const [visible, setVisible] = useState(false);
    return (
        <SecretValue>
            <SecretText>{visible ? value : '•'.repeat(Math.min(value.length, 12))}</SecretText>
            <EyeBtn type="button" onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={14} /> : <Eye size={14} />}</EyeBtn>
        </SecretValue>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const MCPPage: React.FC = () => {
    const { selectedProjectId } = useProject();
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);
    const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);
    const [toolsMap, setToolsMap] = useState<Record<string, MCPTool[]>>({});
    const [loadingTools, setLoadingTools] = useState<Record<string, boolean>>({});
    const [toolErrors, setToolErrors] = useState<Record<string, string>>({});

    const handleDiscover = async (appId: string) => {
        setLoadingTools(prev => ({ ...prev, [appId]: true }));
        setToolErrors(prev => ({ ...prev, [appId]: '' }));
        try {
            const tools = await discoverTools(appId);
            setToolsMap(prev => ({ ...prev, [appId]: tools }));
        } catch (e) {
            setToolErrors(prev => ({ ...prev, [appId]: 'Failed to discover tools' }));
        } finally {
            setLoadingTools(prev => ({ ...prev, [appId]: false }));
        }
    };

    const loadApps = useCallback(async () => {
        setIsLoading(true);
        try {
            const all = await fetchApplications();
            setApps(all.filter(a => a.category === 'MCP'));
        } catch (e) {
            console.error('Failed to load MCP servers', e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedProjectId]);

    useEffect(() => { loadApps(); }, [loadApps]);

    const handleDeleteRequest = (app: ApplicationConfig) => setAppToDelete(app);

    const handleDeleteConfirm = async () => {
        if (!appToDelete?.id) return;
        await deleteApplication(appToDelete.id);
        setAppToDelete(null);
        loadApps();
    };

    const handleEdit = (app: ApplicationConfig) => {
        setAppToEdit(app);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setAppToEdit(null);
    };

    const filtered = apps.filter(a =>
        !searchTerm ||
        (a.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.type ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeCount = apps.length;

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>MCP Servers</PageTitle>
                    <PageSubtitle>Model Context Protocol integrations for your agents</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>🔍</span>
                        <SearchInput
                            placeholder="Search servers..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
                    <AddButton onClick={() => { setAppToEdit(null); setIsModalOpen(true); }}>
                        + Add server
                    </AddButton>
                </HeaderActions>
            </PageHeader>

            {!isLoading && (
                <StatsBar>
                    <StatChip><strong>{apps.length}</strong> Total servers</StatChip>
                    <StatChip><strong>{activeCount}</strong> Active</StatChip>
                    <StatChip><strong>{apps.length - activeCount}</strong> Inactive</StatChip>
                </StatsBar>
            )}

            {isLoading ? (
                <CenterBox>
                    <LoadingSpinner />
                    <p>Loading MCP servers…</p>
                </CenterBox>
            ) : (
                <ServerList>
                    {filtered.map(app => {
                        const isOpen = openId === app.id;
                        const config = flattenConfig(app.config);
                        const configEntries = Object.entries(config);
                        const url = getServerUrl(config);

                        return (
                            <ServerCard key={app.id}>
                                <ServerHeader onClick={() => setOpenId(isOpen ? null : app.id)}>
                                    <ServerIcon><img src="/img/mcp.png" alt="MCP" /></ServerIcon>
                                    <ServerMeta>
                                        <ServerName>{app.name}</ServerName>
                                        <ServerSubtitle>{url || app.type}</ServerSubtitle>
                                    </ServerMeta>
                                    <ServerHeaderRight>
                                        <TransportBadge>{app.type}</TransportBadge>
                                        <StatusBadge $active={true}>Active</StatusBadge>
                                        <ChevronIcon $open={isOpen}>▼</ChevronIcon>
                                    </ServerHeaderRight>
                                </ServerHeader>

                                <AccordionBody $open={isOpen}>
                                    <BodyGrid>
                                        <Section>
                                            <SectionTitle>Configuration</SectionTitle>
                                            {configEntries.length === 0 ? (
                                                <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                                                    No configuration data
                                                </p>
                                            ) : (
                                                configEntries.map(([k, v]) => (
                                                    <ConfigRow key={k}>
                                                        <ConfigKey>{k.replace(/_/g, ' ')}</ConfigKey>
                                                        {isSecretKey(k) ? (
                                                            <SecretField value={v} />
                                                        ) : (
                                                            <ConfigValue title={v}>{v}</ConfigValue>
                                                        )}
                                                    </ConfigRow>
                                                ))
                                            )}
                                        </Section>

                                        <Section>
                                            <SectionTitle>Tools</SectionTitle>
                                            {toolsMap[app.id] ? (
                                                toolsMap[app.id].length > 0 ? (
                                                    <ToolList>
                                                        {toolsMap[app.id].map(tool => (
                                                            <ToolItem key={tool.name}>
                                                                <ToolName>{tool.name}</ToolName>
                                                                {tool.description && (
                                                                    <ToolDescription>{tool.description}</ToolDescription>
                                                                )}
                                                            </ToolItem>
                                                        ))}
                                                    </ToolList>
                                                ) : (
                                                    <ToolDescription>No tools available</ToolDescription>
                                                )
                                            ) : (
                                                <>
                                                    <DiscoverButton
                                                        onClick={() => handleDiscover(app.id)}
                                                        disabled={loadingTools[app.id]}
                                                    >
                                                        {loadingTools[app.id] ? (
                                                            <><DiscoverSpinner /> Discovering…</>
                                                        ) : (
                                                            'Discover Tools'
                                                        )}
                                                    </DiscoverButton>
                                                    {toolErrors[app.id] && (
                                                        <DiscoverError>{toolErrors[app.id]}</DiscoverError>
                                                    )}
                                                </>
                                            )}
                                        </Section>
                                    </BodyGrid>

                                    <BodyActions>
                                        <EditBtn onClick={() => handleEdit(app)}>Edit</EditBtn>
                                        <DeleteBtn onClick={() => handleDeleteRequest(app)}>Remove</DeleteBtn>
                                    </BodyActions>
                                </AccordionBody>
                            </ServerCard>
                        );
                    })}

                    <AddCard onClick={() => { setAppToEdit(null); setIsModalOpen(true); }}>
                        + Add new MCP server
                    </AddCard>
                </ServerList>
            )}

            <CreateMcpModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                onCreated={loadApps}
                appToEdit={appToEdit}
            />
            <DeleteConfirmModal
                isOpen={!!appToDelete}
                onClose={() => setAppToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={appToDelete?.name ?? ''}
            />
        </PageWrapper>
    );
};

export default MCPPage;
