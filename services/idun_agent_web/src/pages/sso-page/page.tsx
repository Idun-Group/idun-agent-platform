import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { BookOpen } from 'lucide-react';
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
    font-family: 'IBM Plex Sans', sans-serif;
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
    color: #e1e4e8;
    margin: 0 0 6px;
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: #8899a6;
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
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 0 14px;
    height: 38px;
`;

const SearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: #e1e4e8;
    font-size: 14px;
    width: 180px;

    &::placeholder { color: #8899a6; }
`;

const DocsButton = styled.a`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 38px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    color: #8899a6;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
    white-space: nowrap;
    &:hover {
        color: #e1e4e8;
        border-color: rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.08);
    }
`;

const AddButton = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 18px;
    height: 38px;
    background: #0C5CAB;
    border: none;
    border-radius: 10px;
    color: #e1e4e8;
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
    background: rgba(20, 26, 38, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: border-color 0.2s, box-shadow 0.2s;

    &:hover {
        border-color: rgba(12, 92, 171, 0.3);
        box-shadow: 0 4px 24px rgba(12, 92, 171, 0.08);
    }
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
    background: rgba(255, 255, 255, 0.04);
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
    color: #e1e4e8;
    margin: 0;
`;

const ProviderType = styled.p`
    font-size: 12px;
    color: #8899a6;
    margin: 0;
    margin-top: 2px;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: ${p => p.$active ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)'};
    color: ${p => p.$active ? '#34d399' : '#8899a6'};
    border: 1px solid ${p => p.$active ? 'rgba(52, 211, 153, 0.3)' : 'transparent'};
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
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
    color: #8899a6;
    flex-shrink: 0;
`;

const ConfigValue = styled.span`
    font-size: 12px;
    color: #6b7a8d;
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
    background: rgba(12, 92, 171, 0.12);
    color: #0C5CAB;
    border: 1px solid rgba(12, 92, 171, 0.2);
`;

const AgentCountBadge = styled.span`
    font-size: 11px;
    color: #8899a6;
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
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: #e1e4e8;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.08); }
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
    border: 2px dashed rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    padding: 40px 24px;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 200px;

    &:hover {
        border-color: #0C5CAB;
        background: rgba(12, 92, 171, 0.05);

        span { color: #0C5CAB; }
        p { color: #e1e4e8; }
    }
`;

const AddIcon = styled.span`
    font-size: 32px;
    color: rgba(255, 255, 255, 0.15);
    transition: color 0.2s;
`;

const AddLabel = styled.p`
    font-size: 14px;
    font-weight: 500;
    color: #8899a6;
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
    color: #8899a6;
    text-align: center;
`;

const LoadingSpinner = styled.div`
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.06);
    border-top-color: #0C5CAB;
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
                        <span style={{ color: '#8899a6', fontSize: 14 }}>🔍</span>
                        <SearchInput
                            placeholder="Search configs..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
                    <DocsButton href="https://docs.idunplatform.com/auth/overview" target="_blank" rel="noopener noreferrer">
                        <BookOpen size={15} /> Docs
                    </DocsButton>
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
