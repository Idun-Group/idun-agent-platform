import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { fetchSSOs, deleteSSO } from '../../services/sso';
import type { ManagedSSO } from '../../services/sso';
import CreateSsoModal from '../../components/applications/create-sso-modal/component';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';

// ── Animations ────────────────────────────────────────────────────────────────

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;
const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

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

// ── Grid ─────────────────────────────────────────────────────────────────────

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
`;

// ── Cards ─────────────────────────────────────────────────────────────────────

const Card = styled.div`
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: border-color 0.2s;

    &:hover { border-color: hsl(var(--primary) / 0.3); }
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
    background: var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 20px;
`;

const ProviderName = styled.div``;

const ProviderTitle = styled.p`
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const ProviderType = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
    margin-top: 2px;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: ${p => p.$active ? 'hsl(var(--success) / 0.15)' : 'var(--border-subtle)'};
    color: ${p => p.$active ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))'};
    border: 1px solid ${p => p.$active ? 'hsl(var(--success) / 0.3)' : 'transparent'};
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid var(--border-subtle);
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
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
`;

const ConfigValue = styled.span`
    font-size: 12px;
    color: hsl(var(--text-secondary));
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
`;

const TagList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-width: 180px;
`;

const Tag = styled.span`
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 6px;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.2);
`;

const AgentCountBadge = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    display: flex;
    align-items: center;
    gap: 4px;
`;

const CardActions = styled.div`
    display: flex;
    gap: 10px;
    margin-top: auto;
`;

const EditBtn = styled.button`
    flex: 1;
    padding: 8px;
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
    flex: 1;
    padding: 8px;
    background: hsl(var(--destructive) / 0.08);
    border: 1px solid hsl(var(--destructive) / 0.2);
    border-radius: 8px;
    color: hsl(var(--destructive));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: hsl(var(--destructive) / 0.18); }
`;

// ── Add Card ──────────────────────────────────────────────────────────────────

const AddCard = styled.button`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: transparent;
    border: 2px dashed var(--border-light);
    border-radius: 16px;
    padding: 40px 24px;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 200px;

    &:hover {
        border-color: hsl(var(--primary));
        background: hsl(var(--primary) / 0.05);

        span { color: hsl(var(--primary)); }
        p { color: hsl(var(--foreground)); }
    }
`;

const AddIcon = styled.span`
    font-size: 32px;
    color: var(--overlay-strong);
    transition: color 0.2s;
`;

const AddLabel = styled.p`
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    margin: 0;
    transition: color 0.2s;
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

const getIssuerLabel = (issuer: string): string => {
    if (issuer.includes('google')) return 'Google';
    if (issuer.includes('okta')) return 'Okta';
    if (issuer.includes('auth0')) return 'Auth0';
    if (issuer.includes('microsoft') || issuer.includes('login.microsoftonline')) return 'Microsoft';
    return 'OIDC';
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const SSOPage: React.FC = () => {
    const [configs, setConfigs] = useState<ManagedSSO[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [configToEdit, setConfigToEdit] = useState<ManagedSSO | null>(null);
    const [configToDelete, setConfigToDelete] = useState<ManagedSSO | null>(null);

    const loadConfigs = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchSSOs();
            setConfigs(data);
        } catch (e) {
            console.error('Failed to load SSO configs', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadConfigs(); }, [loadConfigs]);

    const openCreate = () => { setConfigToEdit(null); setIsModalOpen(true); };
    const openEdit = (config: ManagedSSO) => { setConfigToEdit(config); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setConfigToEdit(null); };

    const handleDeleteConfirm = async () => {
        if (!configToDelete?.id) return;
        await deleteSSO(configToDelete.id);
        setConfigToDelete(null);
        loadConfigs();
    };

    const filtered = configs.filter(c =>
        !searchTerm ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.sso.issuer.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>SSO / OIDC</PageTitle>
                    <PageSubtitle>Protect your agent endpoints with Single Sign-On</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>🔍</span>
                        <SearchInput
                            placeholder="Search configs..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
                    <AddButton onClick={openCreate}>
                        + Add SSO config
                    </AddButton>
                </HeaderActions>
            </PageHeader>

            {isLoading ? (
                <CenterBox>
                    <LoadingSpinner />
                    <p>Loading SSO configurations…</p>
                </CenterBox>
            ) : (
                <Grid>
                    {filtered.map(config => {
                        const domains = config.sso.allowedDomains ?? [];
                        const emails = config.sso.allowedEmails ?? [];

                        return (
                            <Card key={config.id}>
                                <CardHeader>
                                    <ProviderInfo>
                                        <ProviderIcon>🔒</ProviderIcon>
                                        <ProviderName>
                                            <ProviderTitle>{config.name}</ProviderTitle>
                                            <ProviderType>{getIssuerLabel(config.sso.issuer)}</ProviderType>
                                        </ProviderName>
                                    </ProviderInfo>
                                    <StatusBadge $active={config.sso.enabled}>
                                        {config.sso.enabled ? 'Active' : 'Disabled'}
                                    </StatusBadge>
                                </CardHeader>

                                <Divider />
                                <ConfigList>
                                    <ConfigRow>
                                        <ConfigKey>Issuer</ConfigKey>
                                        <ConfigValue title={config.sso.issuer}>{config.sso.issuer}</ConfigValue>
                                    </ConfigRow>
                                    <ConfigRow>
                                        <ConfigKey>Client ID</ConfigKey>
                                        <ConfigValue title={config.sso.clientId}>{config.sso.clientId}</ConfigValue>
                                    </ConfigRow>
                                    {domains.length > 0 && (
                                        <ConfigRow>
                                            <ConfigKey>Domains</ConfigKey>
                                            <TagList>
                                                {domains.map(d => <Tag key={d}>{d}</Tag>)}
                                            </TagList>
                                        </ConfigRow>
                                    )}
                                    {emails.length > 0 && (
                                        <ConfigRow>
                                            <ConfigKey>Emails</ConfigKey>
                                            <TagList>
                                                {emails.map(e => <Tag key={e}>{e}</Tag>)}
                                            </TagList>
                                        </ConfigRow>
                                    )}
                                </ConfigList>

                                {(config.agentCount ?? 0) > 0 && (
                                    <AgentCountBadge>
                                        Used by {config.agentCount} agent{config.agentCount !== 1 ? 's' : ''}
                                    </AgentCountBadge>
                                )}

                                <CardActions>
                                    <EditBtn onClick={() => openEdit(config)}>Edit</EditBtn>
                                    <DeleteBtn onClick={() => setConfigToDelete(config)}>Remove</DeleteBtn>
                                </CardActions>
                            </Card>
                        );
                    })}

                    <AddCard onClick={openCreate}>
                        <AddIcon>+</AddIcon>
                        <AddLabel>Add SSO configuration</AddLabel>
                    </AddCard>
                </Grid>
            )}

            <CreateSsoModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onCreated={loadConfigs}
                appToEdit={configToEdit}
            />
            <DeleteConfirmModal
                isOpen={!!configToDelete}
                onClose={() => setConfigToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={configToDelete?.name ?? ''}
                description={(configToDelete?.agentCount ?? 0) > 0
                    ? `This SSO config is used by ${configToDelete!.agentCount} agent${configToDelete!.agentCount !== 1 ? 's' : ''}. Remove it from those agents first.`
                    : undefined}
            />
        </PageWrapper>
    );
};

export default SSOPage;
