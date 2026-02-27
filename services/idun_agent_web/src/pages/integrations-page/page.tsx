import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { fetchIntegrations, deleteIntegration } from '../../services/integrations';
import type { ManagedIntegration } from '../../services/integrations';
import CreateIntegrationModal from '../../components/applications/create-integration-modal/component';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import type { IntegrationProvider } from '../../services/integrations';
import { useTranslation } from 'react-i18next';

// ── Provider metadata ────────────────────────────────────────────────────────

interface ProviderMeta {
    label: string;
    color: string;
    comingSoon?: boolean;
}

const PROVIDERS: Record<string, ProviderMeta> = {
    WHATSAPP: { label: 'WhatsApp', color: '#25D366' },
    DISCORD: { label: 'Discord', color: '#5865F2' },
    SLACK: { label: 'Slack', color: '#E01E5A' },
    TEAMS: { label: 'Microsoft Teams', color: '#5059C9', comingSoon: true },
    TELEGRAM: { label: 'Telegram', color: '#26A5E4', comingSoon: true },
};

const WhatsAppIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

const SlackIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" />
    </svg>
);

const DiscordIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
);

const TeamsIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.404 4.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5zM20.34 5.25h-1.872a2.232 2.232 0 0 1-.795.756A3.375 3.375 0 0 1 21 9.375v4.5a3.38 3.38 0 0 1-.138.956A2.626 2.626 0 0 0 23.25 12.3V7.875a2.625 2.625 0 0 0-2.91-2.625zM14.25 5.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17.25 9.375A3.375 3.375 0 0 0 13.875 6h-.75A3.375 3.375 0 0 0 9.75 9.375v4.5A3.375 3.375 0 0 0 13.125 17.25h.75a3.375 3.375 0 0 0 3.375-3.375v-4.5zM8.25 8.625A2.627 2.627 0 0 0 5.625 6H3.375A2.625 2.625 0 0 0 .75 8.625V13.5a2.625 2.625 0 0 0 2.625 2.625h.375v3.75a.375.375 0 0 0 .636.265l3.229-3.698A3.369 3.369 0 0 1 9.75 13.875V9.375c0-.263.03-.52.088-.768a2.604 2.604 0 0 0-1.588.018z" />
    </svg>
);

const TelegramIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
);

const PROVIDER_ICONS: Record<string, React.FC> = {
    WHATSAPP: WhatsAppIcon,
    SLACK: SlackIcon,
    DISCORD: DiscordIcon,
    TEAMS: TeamsIcon,
    TELEGRAM: TelegramIcon,
};

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

// ── Section ──────────────────────────────────────────────────────────────────

const SectionTitle = styled.h2`
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.4);
    margin: 8px 0 12px;
`;

// ── Grid ─────────────────────────────────────────────────────────────────────

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
`;

// ── Cards ─────────────────────────────────────────────────────────────────────

const Card = styled.div<{ $borderColor?: string }>`
    background: var(--color-surface, #1a1a2e);
    border: 1px solid ${p => p.$borderColor ? `${p.$borderColor}20` : 'rgba(255, 255, 255, 0.07)'};
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: border-color 0.2s;

    &:hover { border-color: ${p => p.$borderColor ? `${p.$borderColor}50` : 'rgba(108, 99, 255, 0.3)'}; }
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

const ProviderIconBox = styled.div<{ $color: string }>`
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: ${p => `${p.$color}15`};
    color: ${p => p.$color};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
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
    margin: 2px 0 0;
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

// ── Coming Soon Cards ────────────────────────────────────────────────────────

const ComingSoonCard = styled.div<{ $color: string }>`
    background: var(--color-surface, #1a1a2e);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    opacity: 0.5;
    position: relative;
    overflow: hidden;
`;

const ComingSoonBadge = styled.span`
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.45);
    margin-left: auto;
    flex-shrink: 0;
`;

const ComingSoonName = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
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

const maskToken = (token: string): string => {
    if (token.length <= 8) return '••••••••';
    return token.slice(0, 4) + '••••' + token.slice(-4);
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const IntegrationsPage: React.FC = () => {
    const { t } = useTranslation();
    const [configs, setConfigs] = useState<ManagedIntegration[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalProvider, setModalProvider] = useState<IntegrationProvider>('WHATSAPP');
    const [configToEdit, setConfigToEdit] = useState<ManagedIntegration | null>(null);
    const [configToDelete, setConfigToDelete] = useState<ManagedIntegration | null>(null);

    const loadConfigs = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchIntegrations();
            setConfigs(data);
        } catch (e) {
            console.error('Failed to load integrations', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadConfigs(); }, [loadConfigs]);

    const openCreate = (provider: IntegrationProvider) => { setConfigToEdit(null); setModalProvider(provider); setIsModalOpen(true); };
    const openEdit = (config: ManagedIntegration) => { setConfigToEdit(config); setModalProvider(config.integration.provider); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setConfigToEdit(null); };

    const handleDeleteConfirm = async () => {
        if (!configToDelete?.id) return;
        await deleteIntegration(configToDelete.id);
        setConfigToDelete(null);
        loadConfigs();
    };

    const filtered = configs.filter(c =>
        !searchTerm ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.integration.provider.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const comingSoonProviders = Object.entries(PROVIDERS).filter(([, meta]) => meta.comingSoon);

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>{t('integrations.title', 'Integrations')}</PageTitle>
                    <PageSubtitle>{t('integrations.subtitle', 'Connect external messaging platforms to your agents')}</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>🔍</span>
                        <SearchInput
                            placeholder={t('integrations.search', 'Search integrations...')}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
{/* Add buttons are per-provider cards in the grid below */}
                </HeaderActions>
            </PageHeader>

            {isLoading ? (
                <CenterBox>
                    <LoadingSpinner />
                    <p>{t('integrations.loading', 'Loading integrations…')}</p>
                </CenterBox>
            ) : (
                <>
                    <div>
                        <SectionTitle>{t('integrations.active', 'Active Integrations')}</SectionTitle>
                        <Grid>
                            {filtered.map(config => {
                                const provider = config.integration.provider;
                                const meta = PROVIDERS[provider] ?? { label: provider, color: '#8c52ff' };
                                const Icon = PROVIDER_ICONS[provider];

                                return (
                                    <Card key={config.id} $borderColor={meta.color}>
                                        <CardHeader>
                                            <ProviderInfo>
                                                <ProviderIconBox $color={meta.color}>
                                                    {Icon ? <Icon /> : <span>⚡</span>}
                                                </ProviderIconBox>
                                                <ProviderName>
                                                    <ProviderTitle>{config.name}</ProviderTitle>
                                                    <ProviderType>{meta.label}</ProviderType>
                                                </ProviderName>
                                            </ProviderInfo>
                                            <StatusBadge $active={config.integration.enabled}>
                                                {config.integration.enabled ? 'Active' : 'Disabled'}
                                            </StatusBadge>
                                        </CardHeader>

                                        <Divider />
                                        <ConfigList>
                                            {provider === 'WHATSAPP' && 'phone_number_id' in config.integration.config && (
                                                <>
                                                    <ConfigRow>
                                                        <ConfigKey>Phone Number ID</ConfigKey>
                                                        <ConfigValue>{config.integration.config.phone_number_id}</ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Access Token</ConfigKey>
                                                        <ConfigValue title={config.integration.config.access_token}>
                                                            {maskToken(config.integration.config.access_token)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>API Version</ConfigKey>
                                                        <ConfigValue>{config.integration.config.api_version ?? 'v21.0'}</ConfigValue>
                                                    </ConfigRow>
                                                </>
                                            )}
                                            {provider === 'DISCORD' && 'application_id' in config.integration.config && (
                                                <>
                                                    <ConfigRow>
                                                        <ConfigKey>Application ID</ConfigKey>
                                                        <ConfigValue>{config.integration.config.application_id}</ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Bot Token</ConfigKey>
                                                        <ConfigValue title={config.integration.config.bot_token}>
                                                            {maskToken(config.integration.config.bot_token)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Guild ID</ConfigKey>
                                                        <ConfigValue>{config.integration.config.guild_id ?? 'All servers'}</ConfigValue>
                                                    </ConfigRow>
                                                </>
                                            )}
                                            {provider === 'SLACK' && 'signing_secret' in config.integration.config && (
                                                <>
                                                    <ConfigRow>
                                                        <ConfigKey>Bot Token</ConfigKey>
                                                        <ConfigValue title={config.integration.config.bot_token}>
                                                            {maskToken(config.integration.config.bot_token)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Signing Secret</ConfigKey>
                                                        <ConfigValue title={config.integration.config.signing_secret}>
                                                            {maskToken(config.integration.config.signing_secret)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                </>
                                            )}
                                        </ConfigList>

                                        <CardActions>
                                            <EditBtn onClick={() => openEdit(config)}>Edit</EditBtn>
                                            <DeleteBtn onClick={() => setConfigToDelete(config)}>Remove</DeleteBtn>
                                        </CardActions>
                                    </Card>
                                );
                            })}

                            {Object.entries(PROVIDERS)
                                .filter(([, meta]) => !meta.comingSoon)
                                .map(([key, meta]) => {
                                    const Icon = PROVIDER_ICONS[key];
                                    return (
                                        <AddCard key={`add-${key}`} onClick={() => openCreate(key as IntegrationProvider)}>
                                            <ProviderIconBox $color={meta.color}>
                                                {Icon ? <Icon /> : <span>+</span>}
                                            </ProviderIconBox>
                                            <AddLabel>Add {meta.label}</AddLabel>
                                        </AddCard>
                                    );
                                })
                            }
                        </Grid>
                    </div>

                    {comingSoonProviders.length > 0 && (
                        <div>
                            <SectionTitle>{t('integrations.comingSoon', 'Coming Soon')}</SectionTitle>
                            <Grid>
                                {comingSoonProviders.map(([key, meta]) => {
                                    const Icon = PROVIDER_ICONS[key];
                                    return (
                                        <ComingSoonCard key={key} $color={meta.color}>
                                            <ProviderIconBox $color={meta.color}>
                                                {Icon ? <Icon /> : <span>⚡</span>}
                                            </ProviderIconBox>
                                            <ComingSoonName>{meta.label}</ComingSoonName>
                                            <ComingSoonBadge>Coming soon</ComingSoonBadge>
                                        </ComingSoonCard>
                                    );
                                })}
                            </Grid>
                        </div>
                    )}
                </>
            )}

            <CreateIntegrationModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onCreated={loadConfigs}
                appToEdit={configToEdit}
                provider={modalProvider}
            />
            <DeleteConfirmModal
                isOpen={!!configToDelete}
                onClose={() => setConfigToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={configToDelete?.name ?? ''}
            />
        </PageWrapper>
    );
};

export default IntegrationsPage;
