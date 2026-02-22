import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { fetchApplications, deleteApplication } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';
import CreateObservabilityModal from '../../components/applications/create-observability-modal/component';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';

// ── Animations ──────────────────────────────────────────────────────────────

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;
const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

// ── Layout ───────────────────────────────────────────────────────────────────

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

const ConnectButton = styled.button`
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

// ── Grid ─────────────────────────────────────────────────────────────────────

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
`;

// ── Cards ─────────────────────────────────────────────────────────────────────

const Card = styled.div`
    background: var(--color-surface, #1a1a2e);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: border-color 0.2s;

    &:hover { border-color: rgba(108, 99, 255, 0.3); }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const ProviderInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const ProviderIcon = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;

    img {
        width: 26px;
        height: 26px;
        object-fit: contain;
    }
`;

const ProviderName = styled.div``;

const ProviderTitle = styled.p`
    font-size: 15px;
    font-weight: 600;
    color: white;
    margin: 0;
`;

const ProviderType = styled.p`
    font-size: 12px;
    color: var(--color-text-muted, #888);
    margin: 0;
    margin-top: 2px;
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

const Divider = styled.hr`
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin: 0;
`;

const ConfigList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
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
    max-width: 180px;
`;

const SecretValue = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 180px;
`;

const SecretText = styled.span<{ $visible: boolean }>`
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

const CardActions = styled.div`
    display: flex;
    gap: 10px;
    margin-top: auto;
`;

const EditBtn = styled.button`
    flex: 1;
    padding: 8px;
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
    flex: 1;
    padding: 8px;
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

// ── Add Card ──────────────────────────────────────────────────────────────────

const AddCard = styled.button`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: transparent;
    border: 2px dashed rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 40px 24px;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 200px;

    &:hover {
        border-color: var(--color-primary, #6c63ff);
        background: rgba(108, 99, 255, 0.05);

        span { color: var(--color-primary, #6c63ff); }
        p { color: rgba(255, 255, 255, 0.7); }
    }
`;

const AddIcon = styled.span`
    font-size: 32px;
    color: rgba(255, 255, 255, 0.25);
    transition: color 0.2s;
`;

const AddLabel = styled.p`
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
    transition: color 0.2s;
`;

// ── Empty / Loading states ────────────────────────────────────────────────────

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

const SECRET_KEYS = ['secret_key', 'secretKey', 'api_key', 'apiKey', 'credentials', 'private_key'];

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

// ── SecretField component ─────────────────────────────────────────────────────

const SecretField: React.FC<{ value: string }> = ({ value }) => {
    const [visible, setVisible] = useState(false);
    return (
        <SecretValue>
            <SecretText $visible={visible}>{visible ? value : '•'.repeat(Math.min(value.length, 12))}</SecretText>
            <EyeBtn type="button" onClick={() => setVisible(v => !v)}>{visible ? '🙈' : '👁️'}</EyeBtn>
        </SecretValue>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const ObservabilityPage: React.FC = () => {
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);

    const openCreate = () => { setAppToEdit(null); setIsModalOpen(true); };
    const openEdit = (app: ApplicationConfig) => { setAppToEdit(app); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setAppToEdit(null); };

    const loadApps = useCallback(async () => {
        setIsLoading(true);
        try {
            const all = await fetchApplications();
            setApps(all.filter(a => a.category === 'Observability'));
        } catch (e) {
            console.error('Failed to load observability apps', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadApps(); }, [loadApps]);

    const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);

    const handleDeleteRequest = (app: ApplicationConfig) => setAppToDelete(app);

    const handleDeleteConfirm = async () => {
        if (!appToDelete?.id) return;
        await deleteApplication(appToDelete.id);
        setAppToDelete(null);
        loadApps();
    };

    const filtered = apps.filter(a =>
        !searchTerm || (a.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.type ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Observability</PageTitle>
                    <PageSubtitle>Monitor and trace your AI agent activity</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>🔍</span>
                        <SearchInput
                            placeholder="Search integrations..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
                    <ConnectButton onClick={openCreate}>
                        + Connect provider
                    </ConnectButton>
                </HeaderActions>
            </PageHeader>

            {isLoading ? (
                <CenterBox>
                    <LoadingSpinner />
                    <p>Loading integrations…</p>
                </CenterBox>
            ) : (
                <Grid>
                    {filtered.map(app => {
                        const config = flattenConfig(app.config);
                        const configEntries = Object.entries(config);
                        return (
                            <Card key={app.id}>
                                <CardHeader>
                                    <ProviderInfo>
                                        <ProviderIcon>
                                            <img src={app.imageUrl} alt={app.type ?? ''} />
                                        </ProviderIcon>
                                        <ProviderName>
                                            <ProviderTitle>{app.name}</ProviderTitle>
                                            <ProviderType>{app.type}</ProviderType>
                                        </ProviderName>
                                    </ProviderInfo>
                                    <StatusBadge $active={true}>Active</StatusBadge>
                                </CardHeader>

                                {configEntries.length > 0 && (
                                    <>
                                        <Divider />
                                        <ConfigList>
                                            {configEntries.slice(0, 4).map(([k, v]) => (
                                                <ConfigRow key={k}>
                                                    <ConfigKey>{k.replace(/_/g, ' ')}</ConfigKey>
                                                    {isSecretKey(k) ? (
                                                        <SecretField value={v} />
                                                    ) : (
                                                        <ConfigValue title={v}>{v}</ConfigValue>
                                                    )}
                                                </ConfigRow>
                                            ))}
                                        </ConfigList>
                                    </>
                                )}

                                <CardActions>
                                    <EditBtn onClick={() => openEdit(app)}>Edit</EditBtn>
                                    <DeleteBtn onClick={() => handleDeleteRequest(app)}>Remove</DeleteBtn>
                                </CardActions>
                            </Card>
                        );
                    })}

                    <AddCard onClick={openCreate}>
                        <AddIcon>+</AddIcon>
                        <AddLabel>Connect new integration</AddLabel>
                    </AddCard>
                </Grid>
            )}

            <CreateObservabilityModal
                isOpen={isModalOpen}
                onClose={closeModal}
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

export default ObservabilityPage;
