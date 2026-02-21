import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { fetchApplications, deleteApplication } from '../../services/applications';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import type { ApplicationConfig } from '../../types/application.types';
import CreateMcpModal from '../../components/applications/create-mcp-modal/component';

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
    color: white;
    margin: 0 0 6px;
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: var(--color-text-muted, #888);
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
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 0 14px;
    height: 38px;
`;

const SearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 14px;
    width: 180px;

    &::placeholder { color: rgba(255, 255, 255, 0.35); }
`;

const AddButton = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 18px;
    height: 38px;
    background: var(--color-primary, #6c63ff);
    border: none;
    border-radius: 10px;
    color: white;
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
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    font-size: 13px;
    color: var(--color-text-secondary, #ccc);

    strong { color: white; font-weight: 700; }
`;

// ── Accordion List ────────────────────────────────────────────────────────────

const ServerList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const ServerCard = styled.div`
    background: var(--color-surface, #1a1a2e);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    overflow: hidden;
    transition: border-color 0.2s;

    &:hover { border-color: rgba(108, 99, 255, 0.25); }
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
    color: white;
`;

const ServerIcon = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
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
    color: white;
    margin: 0 0 4px;
`;

const ServerSubtitle = styled.p`
    font-size: 12px;
    color: var(--color-text-muted, #888);
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
    background: ${p => p.$active ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.07)'};
    color: ${p => p.$active ? '#34d399' : '#888'};
    border: 1px solid ${p => p.$active ? 'rgba(52, 211, 153, 0.3)' : 'transparent'};
`;

const TransportBadge = styled.span`
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: rgba(108, 99, 255, 0.12);
    color: var(--color-primary, #6c63ff);
    border: 1px solid rgba(108, 99, 255, 0.2);
`;

const ChevronIcon = styled.span<{ $open: boolean }>`
    font-size: 12px;
    transition: transform 0.2s;
    transform: ${p => p.$open ? 'rotate(180deg)' : 'rotate(0deg)'};
    color: rgba(255, 255, 255, 0.4);
`;

const AccordionBody = styled.div<{ $open: boolean }>`
    display: ${p => p.$open ? 'block' : 'none'};
    animation: ${p => p.$open ? expandDown : 'none'} 0.25s ease;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
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
    color: var(--color-text-muted, #888);
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
    color: var(--color-text-muted, #888);
    text-transform: capitalize;
    flex-shrink: 0;
`;

const ConfigValue = styled.span`
    font-size: 12px;
    color: var(--color-text-secondary, #ccc);
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
    color: var(--color-text-secondary, #ccc);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const EyeBtn = styled.button`
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    cursor: pointer;
    padding: 0;
    font-size: 12px;
    flex-shrink: 0;

    &:hover { color: white; }
`;

const CapabilitiesPlaceholder = styled.div`
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.3);
    text-align: center;
`;

const BodyActions = styled.div`
    display: flex;
    gap: 10px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
`;

const EditBtn = styled.button`
    padding: 8px 18px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.12); }
`;

const DeleteBtn = styled.button`
    padding: 8px 18px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 8px;
    color: #f87171;
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
    border: 2px dashed rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 28px;
    cursor: pointer;
    transition: all 0.2s;
    color: rgba(255, 255, 255, 0.3);
    font-size: 14px;

    &:hover {
        border-color: var(--color-primary, #6c63ff);
        background: rgba(108, 99, 255, 0.05);
        color: var(--color-primary, #6c63ff);
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
    color: var(--color-text-muted, #888);
    text-align: center;
`;

const LoadingSpinner = styled.div`
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--color-primary, #6c63ff);
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
            <EyeBtn type="button" onClick={() => setVisible(v => !v)}>{visible ? '🙈' : '👁️'}</EyeBtn>
        </SecretValue>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const MCPPage: React.FC = () => {
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);
    const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);

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
    }, []);

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
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>🔍</span>
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
                                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', margin: 0 }}>
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
                                            <SectionTitle>Capabilities</SectionTitle>
                                            <CapabilitiesPlaceholder>
                                                Connect to discover tools &amp; resources
                                            </CapabilitiesPlaceholder>
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
