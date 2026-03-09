import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
    Ban,
    ShieldAlert,
    Skull,
    Type,
    Code2,
    Lock,
    LockKeyhole,
    Shield,
    Bot,
    Scale,
    Trophy,
    Globe,
    Target,
    Brain,
    KeyRound,
    ExternalLink,
    Check,
    Eye,
    EyeOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchApplications, deleteApplication } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';
import CreateGuardrailModal from '../../components/applications/create-guardrail-modal/component';
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

// ── API Key Banner ────────────────────────────────────────────────────────────

const LOCALSTORAGE_KEY = 'guardrails_api_key';

const ApiKeyBanner = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    flex-wrap: wrap;
`;

const ApiKeyLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
`;

const ApiKeyIconBox = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: hsl(var(--primary) / 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ApiKeyLabel = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
    white-space: nowrap;
`;

const ApiKeyInputGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 200px;
`;

const ApiKeyInput = styled.input`
    flex: 1;
    padding: 8px 12px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: monospace;
    outline: none;
    transition: border-color 0.15s;

    &::placeholder { color: hsl(var(--muted-foreground)); }
    &:focus { border-color: hsl(var(--primary)); }
`;

const ToggleVisBtn = styled.button`
    background: transparent;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;

    &:hover { color: hsl(var(--foreground)); }
`;

const SaveKeyBtn = styled.button<{ $saved?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: ${p => p.$saved ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--primary))'};
    border: ${p => p.$saved ? '1px solid hsl(var(--primary) / 0.3)' : 'none'};
    border-radius: 8px;
    color: ${p => p.$saved ? 'hsl(var(--primary))' : 'hsl(var(--primary-foreground))'};
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover { opacity: 0.88; }
`;

const ApiKeyHubLink = styled.a`
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: hsl(var(--primary));
    text-decoration: none;
    white-space: nowrap;

    &:hover { text-decoration: underline; }
`;

const ApiKeyHint = styled.p`
    width: 100%;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 4px 0 0;
    line-height: 1.5;
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

// ── Grid ──────────────────────────────────────────────────────────────────────

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
`;

// ── Cards ──────────────────────────────────────────────────────────────────────

const Card = styled.div`
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    transition: border-color 0.2s;

    &:hover { border-color: hsl(var(--primary) / 0.3); }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const GuardrailInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const GuardrailIcon = styled.div`
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: hsl(var(--primary) / 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
`;

const GuardrailMeta = styled.div``;

const GuardrailName = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 3px;
`;

const GuardrailType = styled.p`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const GroupBadge = styled.span`
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 20px;
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.2);
    white-space: nowrap;
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 0;
`;

const ConfigList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ConfigRow = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
`;

const ConfigKey = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    text-transform: capitalize;
    flex-shrink: 0;
    padding-top: 1px;
`;

const ConfigValue = styled.span`
    font-size: 12px;
    color: hsl(var(--text-secondary));
    font-family: monospace;
    word-break: break-all;
    max-width: 170px;
    text-align: right;
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
    min-height: 180px;

    &:hover {
        border-color: hsl(var(--primary));
        background: hsl(var(--primary) / 0.05);

        span { color: hsl(var(--primary)); }
        p { color: hsl(var(--foreground)); }
    }
`;

const AddIcon = styled.span`
    font-size: 28px;
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

const TYPE_META: Record<string, { icon: LucideIcon; group: string }> = {
    ModelArmor:       { icon: Shield, group: 'Enterprise' },
    CustomLLM:        { icon: Bot, group: 'Enterprise' },
    BanList:          { icon: Ban, group: 'Content Safety' },
    NSFWText:         { icon: ShieldAlert, group: 'Content Safety' },
    ToxicLanguage:    { icon: Skull, group: 'Content Safety' },
    GibberishText:    { icon: Type, group: 'Content Safety' },
    CodeScanner:      { icon: Code2, group: 'Content Safety' },
    DetectPII:        { icon: Lock, group: 'Identity & Security' },
    DetectJailbreak:  { icon: LockKeyhole, group: 'Identity & Security' },
    PromptInjection:  { icon: ShieldAlert, group: 'Identity & Security' },
    BiasCheck:        { icon: Scale, group: 'Context & Quality' },
    CompetitionCheck: { icon: Trophy, group: 'Context & Quality' },
    CorrectLanguage:  { icon: Globe, group: 'Context & Quality' },
    RestrictTopic:    { icon: Target, group: 'Context & Quality' },
    RagHallucination: { icon: Brain, group: 'Context & Quality' },
};

const flattenConfig = (config: unknown): Record<string, string> => {
    if (!config || typeof config !== 'object') return {};
    const obj = config as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const k in obj) {
        const v = obj[k];
        if (v !== null && v !== undefined && v !== '') {
            result[k] = typeof v === 'string' ? v : String(v);
        }
    }
    return result;
};

const truncate = (s: string, max = 30) => s.length > max ? s.slice(0, max) + '…' : s;

// ── Main Page ─────────────────────────────────────────────────────────────────

const GuardrailsPage: React.FC = () => {
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);
    const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);
    const [globalApiKey, setGlobalApiKey] = useState(() => localStorage.getItem(LOCALSTORAGE_KEY) ?? '');
    const [apiKeySaved, setApiKeySaved] = useState(() => !!localStorage.getItem(LOCALSTORAGE_KEY));
    const [showApiKey, setShowApiKey] = useState(false);

    const loadApps = useCallback(async () => {
        setIsLoading(true);
        try {
            const all = await fetchApplications();
            setApps(all.filter(a => a.category === 'Guardrails'));
        } catch (e) {
            console.error('Failed to load guardrails', e);
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

    const openCreate = () => { setAppToEdit(null); setIsModalOpen(true); };
    const openEdit = (app: ApplicationConfig) => { setAppToEdit(app); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setAppToEdit(null); };

    const handleSaveApiKey = () => {
        const trimmed = globalApiKey.trim();
        if (trimmed) {
            localStorage.setItem(LOCALSTORAGE_KEY, trimmed);
        } else {
            localStorage.removeItem(LOCALSTORAGE_KEY);
        }
        setApiKeySaved(true);
        setTimeout(() => setApiKeySaved(false), 2000);
    };

    const filtered = apps.filter(a =>
        !searchTerm ||
        (a.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.type ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Guardrails</PageTitle>
                    <PageSubtitle>Enforce safety rules and content policies on your agents</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>🔍</span>
                        <SearchInput
                            placeholder="Search guardrails..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
                    <AddButton onClick={openCreate}>
                        + Add guardrail
                    </AddButton>
                </HeaderActions>
            </PageHeader>

            <ApiKeyBanner>
                <ApiKeyLeft>
                    <ApiKeyIconBox><KeyRound size={18} color="hsl(var(--primary))" /></ApiKeyIconBox>
                    <ApiKeyLabel>Guardrails AI API Key</ApiKeyLabel>
                </ApiKeyLeft>
                <ApiKeyInputGroup>
                    <ApiKeyInput
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="Enter your Guardrails AI API key"
                        value={globalApiKey}
                        onChange={e => { setGlobalApiKey(e.target.value); setApiKeySaved(false); }}
                    />
                    <ToggleVisBtn type="button" onClick={() => setShowApiKey(v => !v)} title={showApiKey ? 'Hide' : 'Show'}>
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </ToggleVisBtn>
                    <SaveKeyBtn type="button" $saved={apiKeySaved} onClick={handleSaveApiKey}>
                        {apiKeySaved ? <><Check size={14} /> Saved</> : 'Save'}
                    </SaveKeyBtn>
                </ApiKeyInputGroup>
                <ApiKeyHubLink href="https://hub.guardrailsai.com" target="_blank" rel="noopener noreferrer">
                    Get a key <ExternalLink size={12} />
                </ApiKeyHubLink>
                <ApiKeyHint>
                    This key auto-fills into new guardrails. You can override it per-guardrail when creating or editing one.
                </ApiKeyHint>
            </ApiKeyBanner>

            {isLoading ? (
                <CenterBox>
                    <LoadingSpinner />
                    <p>Loading guardrails…</p>
                </CenterBox>
            ) : (
                <Grid>
                    {filtered.map(app => {
                        const meta = TYPE_META[app.type] ?? { icon: Shield, group: 'Other' };
                        const config = flattenConfig(app.config);
                        const configEntries = Object.entries(config).filter(([k]) => k !== 'api_key');

                        return (
                            <Card key={app.id}>
                                <CardHeader>
                                    <GuardrailInfo>
                                        <GuardrailIcon aria-hidden><meta.icon size={20} /></GuardrailIcon>
                                        <GuardrailMeta>
                                            <GuardrailName>{app.name}</GuardrailName>
                                            <GuardrailType>{app.type}</GuardrailType>
                                        </GuardrailMeta>
                                    </GuardrailInfo>
                                    <GroupBadge>{meta.group}</GroupBadge>
                                </CardHeader>

                                {configEntries.length > 0 && (
                                    <>
                                        <Divider />
                                        <ConfigList>
                                            {configEntries.slice(0, 3).map(([k, v]) => (
                                                <ConfigRow key={k}>
                                                    <ConfigKey>{k.replace(/_/g, ' ')}</ConfigKey>
                                                    <ConfigValue title={v}>{truncate(v)}</ConfigValue>
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
                        <AddLabel>Add new guardrail</AddLabel>
                    </AddCard>
                </Grid>
            )}

            <CreateGuardrailModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onCreated={loadApps}
                appToEdit={appToEdit}
                defaultApiKey={globalApiKey.trim()}
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

export default GuardrailsPage;
