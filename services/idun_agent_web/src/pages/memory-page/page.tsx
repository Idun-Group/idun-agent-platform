import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
    HardDrive,
    Users,
    BookOpen,
    GitPullRequest,
    X,
    Search,
    Wifi,
    WifiOff,
    Loader2,
} from 'lucide-react';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import { fetchApplications, deleteApplication, createApplication, updateApplication, checkMemoryConnection, mapConfigToApi } from '../../services/applications';
import type { AppType } from '../../types/application.types';
import type { ApplicationConfig } from '../../types/application.types';
import { notify } from '../../components/toast/notify';
import { useProject } from '../../hooks/use-project';
import useWorkspace from '../../hooks/use-workspace';
import NoProjectState from '../../components/general/no-project-state/component';

// ── Provider metadata ────────────────────────────────────────────────────────

interface ProviderMeta {
    id: string;
    name: string;
    framework: string;
    logo: string;
}

const LANGGRAPH_PROVIDERS: ProviderMeta[] = [
    { id: 'SQLite', name: 'SQLite', framework: 'LANGGRAPH', logo: '/img/sqlite-logo.png' },
    { id: 'PostgreSQL', name: 'PostgreSQL', framework: 'LANGGRAPH', logo: '/img/postgresql-logo.png' },
];

const ADK_PROVIDERS: ProviderMeta[] = [
    { id: 'AdkInMemory', name: 'In Memory', framework: 'ADK', logo: '' },
    { id: 'AdkVertexAi', name: 'Vertex AI', framework: 'ADK', logo: '/img/google-cloud-logo.svg' },
    { id: 'AdkDatabase', name: 'Database', framework: 'ADK', logo: '/img/postgresql-logo.png' },
];

const GROUPS = [
    { key: 'LANGGRAPH', label: 'LangGraph', logo: '/img/langgraph-color.png', providers: LANGGRAPH_PROVIDERS },
    { key: 'ADK', label: 'ADK', logo: '/img/agent-development-kit.png', providers: ADK_PROVIDERS },
];

// ── Animations ───────────────────────────────────────────────────────────────

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
    overflow: hidden;
`;

const PageHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    flex-shrink: 0;
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

const HeaderBtn = styled.a`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 38px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
        color: hsl(var(--foreground));
        border-color: var(--border-medium);
        background: var(--overlay-medium);
    }
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
    width: 160px;
    &::placeholder { color: hsl(var(--muted-foreground)); }
`;

// ── Two-column layout ────────────────────────────────────────────────────────

const MainLayout = styled.div`
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 0;
`;

// ── Left column: type picker ─────────────────────────────────────────────────

const TypeColumn = styled.div`
    width: 260px;
    flex-shrink: 0;
    border-right: 1px solid var(--border-subtle);
    padding-right: 24px;
    overflow-y: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
`;

const GroupLabel = styled.p`
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: hsl(var(--text-tertiary));
    margin: 24px 0 10px 10px;
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    gap: 8px;

    &:first-child { margin-top: 0; padding-top: 0; border-top: none; }
`;

const GroupLogo = styled.img`
    width: 20px;
    height: 20px;
    object-fit: contain;
`;

const ProviderLogo = styled.img`
    width: 24px;
    height: 24px;
    object-fit: contain;
    flex-shrink: 0;
`;

const TypeBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px 10px 18px;
    margin-left: 10px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: hsl(var(--text-secondary));
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    margin-bottom: 2px;

    &:hover {
        background: var(--overlay-light);
        color: hsl(var(--foreground));
    }
`;

const TypeIconBox = styled.span`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: hsl(var(--primary) / 0.08);
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const AddIndicator = styled.span`
    margin-left: auto;
    font-size: 16px;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;

    ${TypeBtn}:hover & {
        opacity: 1;
    }
`;

const RequestBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px dashed var(--border-light);
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    margin-top: 16px;

    &:hover {
        border-color: hsl(var(--primary) / 0.4);
        color: hsl(var(--foreground));
        background: hsl(var(--primary) / 0.04);
    }
`;

// ── Right column: config cards + empty state ─────────────────────────────────

const ContentColumn = styled.div`
    flex: 1;
    padding-left: 28px;
    overflow-y: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 20px;
    gap: 16px;
`;

const EmptyTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const EmptyDescription = styled.p`
    font-size: 13px;
    line-height: 1.7;
    color: hsl(var(--text-secondary));
    margin: 0;
    max-width: 420px;
`;

const EmptyChips = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
`;

const Chip = styled.span<{ $color: string }>`
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    background: ${p => `${p.$color}14`};
    color: ${p => p.$color};
    border: 1px solid ${p => `${p.$color}20`};
    letter-spacing: 0.02em;
`;

const EmptyImage = styled.img`
    width: 100%;
    max-width: 380px;
    margin-top: 8px;
`;

// ── Config cards ─────────────────────────────────────────────────────────────

const CardsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
`;

const Card = styled.div`
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.2s;

    &:hover { border-color: hsl(var(--primary) / 0.3); }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const CardInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const CardIcon = styled.div`
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const CardMeta = styled.div``;

const CardName = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 2px;
`;

const CardType = styled.p`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const TypeBadge = styled.span`
    font-size: 10px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 20px;
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.2);
    white-space: nowrap;
`;

const StatusRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

const StatusDot = styled.div<{ $color: string }>`
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: ${p => p.$color};
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 0;
`;

const AgentCountBadge = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
`;

const UpdatedLabel = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
`;

const CardActions = styled.div`
    display: flex;
    gap: 8px;
    margin-top: auto;
`;

const EditBtn = styled.button`
    flex: 1;
    padding: 7px;
    background: var(--border-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: var(--overlay-medium); }
`;

const DeleteBtn = styled.button`
    flex: 1;
    padding: 7px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 8px;
    color: hsl(var(--destructive));
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(248, 113, 113, 0.18); }
`;

const VerifyBtn = styled.button`
    flex: 1;
    padding: 7px;
    background: rgba(140, 82, 255, 0.08);
    border: 1px solid rgba(140, 82, 255, 0.25);
    border-radius: 8px;
    color: #8c52ff;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    &:hover:not(:disabled) { background: rgba(140, 82, 255, 0.18); }
    &:disabled { opacity: 0.7; cursor: wait; }
`;

const VerifySpinner = styled(Loader2)`
    animation: spin 1s linear infinite;
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const VerifyStatus = styled.div<{ $success: boolean }>`
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
    margin-top: 4px;
    ${p => p.$success ? `color: #34d399;` : `color: #f87171;`}
`;

// ── Per-provider modal ───────────────────────────────────────────────────────

const modalIn = keyframes`from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); }`;

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: var(--overlay-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Modal = styled.div`
    background: hsl(var(--card));
    border-radius: 16px;
    width: 480px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border-light);
    animation: ${modalIn} 0.2s ease;
`;

const ModalHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 24px 28px 20px;
    border-bottom: 1px solid var(--border-subtle);
`;

const ModalIcon = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: hsl(var(--primary) / 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;

    img { width: 24px; height: 24px; object-fit: contain; }
`;

const ModalTitleBlock = styled.div`
    flex: 1;
`;

const ModalTitle = styled.h2`
    font-size: 16px;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0;
`;

const ModalSubtitle = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 2px 0 0;
`;

const CloseBtn = styled.button`
    background: var(--overlay-light);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
    &:hover { background: var(--border-medium); color: hsl(var(--foreground)); }
`;

const ModalBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 24px 28px;
`;

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const Label = styled.label`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--text-secondary));
    margin-bottom: 8px;
`;

const Required = styled.span`
    color: hsl(var(--destructive));
`;


const FieldHint = styled.p`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    margin: 8px 0 0;
    line-height: 1.5;
    code {
        background: rgba(140, 82, 255, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        color: #8c52ff;
    }
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 14px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
    &::placeholder { color: hsl(var(--muted-foreground)); }
    &:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 2px hsl(var(--primary) / 0.12); }
`;

const ErrorMsg = styled.p`
    font-size: 13px;
    color: hsl(var(--destructive));
    margin: 0 0 16px;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.1);
    border-radius: 8px;
    border: 1px solid rgba(248, 113, 113, 0.2);
`;

const ModalFooter = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 28px;
    border-top: 1px solid var(--border-subtle);
`;

const CancelBtn = styled.button`
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    color: hsl(var(--text-secondary));
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: var(--overlay-light); color: hsl(var(--foreground)); }
`;

const SubmitBtn = styled.button`
    padding: 10px 24px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 8px;
    color: hsl(var(--primary-foreground));
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

const SmallSpinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid var(--overlay-strong);
    border-top-color: hsl(var(--foreground));
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

const NoConfigText = styled.p`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
    margin: 0;
`;

interface MemoryModalProps {
    provider: ProviderMeta;
    framework: string;
    appToEdit: ApplicationConfig | null;
    onClose: () => void;
    onSaved: () => void;
}

const MemoryModal: React.FC<MemoryModalProps> = ({ provider, framework, appToEdit, onClose, onSaved }) => {
    const isEditMode = !!appToEdit;
    const [name, setName] = useState('');
    const [connectionUrl, setConnectionUrl] = useState('');
    const [projectId, setProjectId] = useState('');
    const [location, setLocation] = useState('');
    const [reasoningEngineAppName, setReasoningEngineAppName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const needsConnection = provider.id === 'PostgreSQL' || provider.id === 'SQLite' || provider.id === 'AdkDatabase';
    const isVertex = provider.id === 'AdkVertexAi';
    const isInMemory = provider.id === 'AdkInMemory';

    useEffect(() => {
        if (appToEdit) {
            setName(appToEdit.name ?? '');
            const cfg = (appToEdit.config ?? {}) as Record<string, unknown>;
            setConnectionUrl(typeof (cfg.connectionString ?? cfg.db_url) === 'string' ? String(cfg.connectionString ?? cfg.db_url) : '');
            setProjectId(typeof (cfg.project_id ?? cfg.projectId) === 'string' ? String(cfg.project_id ?? cfg.projectId) : '');
            setLocation(typeof cfg.location === 'string' ? cfg.location : '');
            setReasoningEngineAppName(
                typeof (cfg.reasoning_engine_app_name ?? cfg.reasoningEngineAppName) === 'string'
                    ? String(cfg.reasoning_engine_app_name ?? cfg.reasoningEngineAppName)
                    : ''
            );
        } else {
            setName('');
            setConnectionUrl('');
            setProjectId('');
            setLocation('');
            setReasoningEngineAppName('');
        }
        setErrorMessage(null);
    }, [appToEdit, provider.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setErrorMessage('Store name is required'); return; }
        if (needsConnection && !connectionUrl.trim()) { setErrorMessage('Connection URL is required'); return; }
        if (isVertex && (!projectId.trim() || !location.trim() || !reasoningEngineAppName.trim())) {
            setErrorMessage('All Vertex AI fields are required'); return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);
        try {
            const config: Record<string, string> = {};
            if (needsConnection) config.connectionString = connectionUrl.trim();
            if (isVertex) {
                config.project_id = projectId.trim();
                config.location = location.trim();
                config.reasoning_engine_app_name = reasoningEngineAppName.trim();
            }

            const payload = {
                name: name.trim(),
                type: provider.id as AppType,
                category: 'Memory' as const,
                config,
                framework,
            };

            if (isEditMode && appToEdit?.id) {
                await updateApplication(appToEdit.id, payload);
            } else {
                await createApplication(payload);
            }
            onSaved();
            onClose();
        } catch (err: unknown) {
            setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSubmitting(false);
        }
    };

    const frameworkLabel = framework === 'LANGGRAPH' ? 'LangGraph' : 'ADK';

    return (
        <Overlay onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <Modal>
                <ModalHeader>
                    <ModalIcon>
                        {provider.logo ? (
                            <img src={provider.logo} alt={provider.name} />
                        ) : (
                            <HardDrive size={20} color="hsl(var(--primary))" />
                        )}
                    </ModalIcon>
                    <ModalTitleBlock>
                        <ModalTitle>{isEditMode ? `Edit ${provider.name}` : provider.name}</ModalTitle>
                        <ModalSubtitle>{frameworkLabel} memory store</ModalSubtitle>
                    </ModalTitleBlock>
                    <CloseBtn type="button" onClick={onClose}><X size={16} /></CloseBtn>
                </ModalHeader>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <ModalBody>
                        {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                        <FieldGroup>
                            <Label htmlFor="store-name">Store Name<Required> *</Required></Label>
                            <Input
                                id="store-name"
                                type="text"
                                placeholder="e.g. Production State"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </FieldGroup>

                        {needsConnection && (
                            <FieldGroup>
                                <Label htmlFor="conn-url">Connection URL<Required> *</Required></Label>
                                <Input
                                    id="conn-url"
                                    type="text"
                                    placeholder={provider.id === 'SQLite' ? 'sqlite:///./data/state.db' : 'postgresql://user:pass@host:5432/db'}
                                    value={connectionUrl}
                                    onChange={e => setConnectionUrl(e.target.value)}
                                />
                                <FieldHint>If your database is on the host and the manager runs in Docker, use <code>host.docker.internal</code> instead of <code>localhost</code>.</FieldHint>
                            </FieldGroup>
                        )}

                        {isVertex && (
                            <>
                                <FieldGroup>
                                    <Label htmlFor="vertex-project">GCP Project ID<Required> *</Required></Label>
                                    <Input id="vertex-project" type="text" placeholder="my-gcp-project" value={projectId} onChange={e => setProjectId(e.target.value)} />
                                </FieldGroup>
                                <FieldGroup>
                                    <Label htmlFor="vertex-location">Location<Required> *</Required></Label>
                                    <Input id="vertex-location" type="text" placeholder="us-central1" value={location} onChange={e => setLocation(e.target.value)} />
                                </FieldGroup>
                                <FieldGroup>
                                    <Label htmlFor="vertex-app">Reasoning Engine App Name<Required> *</Required></Label>
                                    <Input id="vertex-app" type="text" placeholder="my-reasoning-engine" value={reasoningEngineAppName} onChange={e => setReasoningEngineAppName(e.target.value)} />
                                </FieldGroup>
                            </>
                        )}

                        {isInMemory && (
                            <NoConfigText>No additional configuration required for In-Memory storage.</NoConfigText>
                        )}
                    </ModalBody>

                    <ModalFooter>
                        <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                        <SubmitBtn type="submit" disabled={isSubmitting}>
                            {isSubmitting && <SmallSpinner />}
                            {isEditMode ? 'Save Changes' : 'Create Store'}
                        </SubmitBtn>
                    </ModalFooter>
                </form>
            </Modal>
        </Overlay>
    );
};

// ── Loading ──────────────────────────────────────────────────────────────────

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

// ── Main Page ────────────────────────────────────────────────────────────────

const MemoryPage: React.FC = () => {
    const { selectedProjectId, projects, isLoadingProjects, currentProject, canWrite, canAdmin } = useProject();
    const { isCurrentWorkspaceOwner } = useWorkspace();
    const [memories, setMemories] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal
    const [modalProvider, setModalProvider] = useState<ProviderMeta | null>(null);
    const [modalFramework, setModalFramework] = useState<string>('');
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);

    // Delete
    const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);

    // Verify
    const [verifying, setVerifying] = useState<Record<string, boolean>>({});
    const [verifyResult, setVerifyResult] = useState<Record<string, { success: boolean; message: string }>>({});

    const handleVerify = async (mem: ApplicationConfig) => {
        if (!mem.id) return;
        setVerifying(prev => ({ ...prev, [mem.id!]: true }));
        setVerifyResult(prev => { const next = { ...prev }; delete next[mem.id!]; return next; });
        try {
            const config = mapConfigToApi(mem.type, mem.config);
            const result = await checkMemoryConnection(config);
            setVerifyResult(prev => ({ ...prev, [mem.id!]: { success: result.success, message: result.message } }));
            setTimeout(() => setVerifyResult(prev => { const next = { ...prev }; delete next[mem.id!]; return next; }), 10000);
        } catch {
            setVerifyResult(prev => ({ ...prev, [mem.id!]: { success: false, message: 'Request failed' } }));
            setTimeout(() => setVerifyResult(prev => { const next = { ...prev }; delete next[mem.id!]; return next; }), 10000);
        } finally {
            setVerifying(prev => ({ ...prev, [mem.id!]: false }));
        }
    };

    const loadMemories = useCallback(async () => {
        if (!currentProject) {
            setMemories([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const apps = await fetchApplications();
            const memoryApps = apps.filter(app => app.category === 'Memory');
            setMemories(memoryApps);
        } catch (error) {
            console.error('Failed to fetch memories', error);
            notify.error('Failed to fetch memory stores');
        } finally {
            setIsLoading(false);
        }
    }, [currentProject]);

    useEffect(() => { loadMemories(); }, [loadMemories]);

    const openCreate = (provider: ProviderMeta, framework: string) => {
        setAppToEdit(null);
        setModalProvider(provider);
        setModalFramework(framework);
    };

    const openEdit = (app: ApplicationConfig) => {
        const allProviders = [...LANGGRAPH_PROVIDERS, ...ADK_PROVIDERS];
        const provider = allProviders.find(p => p.id === app.type);
        if (provider) {
            setAppToEdit(app);
            setModalProvider(provider);
            setModalFramework(provider.framework);
        }
    };

    const closeModal = () => {
        setModalProvider(null);
        setAppToEdit(null);
    };

    const handleDeleteConfirm = async () => {
        if (!appToDelete?.id) return;
        await deleteApplication(appToDelete.id);
        notify.success('Memory store removed');
        setAppToDelete(null);
        loadMemories();
    };

    if (!isLoadingProjects && !selectedProjectId) {
        const variant =
            projects.length === 0
                ? isCurrentWorkspaceOwner
                    ? 'no-access-owner'
                    : 'no-access-member'
                : 'none-selected';
        return (
            <NoProjectState
                variant={variant}
                pageTitle="Memory Stores"
                pageSubtitle="Persist conversation context across agent sessions."
            />
        );
    }

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Memory Stores</PageTitle>
                    <PageSubtitle>
                        {currentProject
                            ? `Manage memory stores for ${currentProject.name} by agent framework.`
                            : 'Select a project to manage memory stores'}
                    </PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={14} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                        <SearchInput placeholder="Search stores..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </SearchBar>
                    <HeaderBtn href="https://docs.idunplatform.com/memory/overview" target="_blank" rel="noopener noreferrer">
                        <BookOpen size={15} /> Docs
                    </HeaderBtn>
                </HeaderActions>
            </PageHeader>

            <MainLayout>
                {/* ── Left: Store picker ──────────────────────────── */}
                <TypeColumn>
                    {GROUPS.map(group => (
                        <React.Fragment key={group.key}>
                            <GroupLabel>
                                <GroupLogo src={group.logo} alt={group.label} />
                                {group.label}
                            </GroupLabel>
                            {group.providers.map(provider => (
                                <TypeBtn
                                    key={provider.id}
                                    type="button"
                                    onClick={() => canWrite && openCreate(provider, group.key)}
                                >
                                    {provider.logo ? (
                                        <ProviderLogo src={provider.logo} alt={provider.name} />
                                    ) : (
                                        <HardDrive size={18} color="hsl(var(--muted-foreground))" />
                                    )}
                                    {provider.name}
                                    <AddIndicator>+</AddIndicator>
                                </TypeBtn>
                            ))}
                        </React.Fragment>
                    ))}

                    <RequestBtn
                        type="button"
                        onClick={() => window.open('https://github.com/Idun-Group/idun-agent-platform/issues/new?labels=enhancement&template=feature_request.md&title=%5BMemory%5D+New+store+request', '_blank')}
                    >
                        <TypeIconBox><GitPullRequest size={15} /></TypeIconBox>
                        Request a store
                    </RequestBtn>
                </TypeColumn>

                {/* ── Right: Configured stores ────────────────────── */}
                <ContentColumn>
                    {!currentProject ? (
                        <CenterBox>
                            <LoadingSpinner />
                            <p>Select a project from the top navbar to manage memory stores.</p>
                        </CenterBox>
                    ) : isLoading ? (
                        <CenterBox>
                            <LoadingSpinner />
                            <p>Loading memory stores…</p>
                        </CenterBox>
                    ) : memories.length === 0 ? (
                        <EmptyState>
                            <EmptyTitle>Configure a memory store to get started</EmptyTitle>
                            <EmptyDescription>
                                Persist conversation context across sessions. Choose a storage backend for your agent framework.
                            </EmptyDescription>
                            <EmptyChips>
                                <Chip $color="#8b5cf6">LangGraph</Chip>
                                <Chip $color="#3b82f6">ADK</Chip>
                            </EmptyChips>
                            <EmptyImage src="/img/memory-flow.png" alt="" />
                        </EmptyState>
                    ) : (
                        <CardsGrid>
                            {memories.filter(m => {
                                if (!searchTerm) return true;
                                const term = searchTerm.toLowerCase();
                                return (m.name?.toLowerCase().includes(term) || m.type?.toLowerCase().includes(term));
                            }).map(mem => {
                                const frameworkLabel = mem.framework === 'LANGGRAPH' ? 'LangGraph' : (mem.framework ?? 'Unknown');
                                const allProviders = [...LANGGRAPH_PROVIDERS, ...ADK_PROVIDERS];
                                const providerMeta = allProviders.find(p => p.id === mem.type);
                                return (
                                    <Card key={mem.id}>
                                        <CardHeader>
                                            <CardInfo>
                                                <CardIcon>
                                                    {providerMeta?.logo ? (
                                                        <img src={providerMeta.logo} alt={mem.type} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                                                    ) : (
                                                        <HardDrive size={18} />
                                                    )}
                                                </CardIcon>
                                                <CardMeta>
                                                    <CardName>{mem.name}</CardName>
                                                    <CardType>{mem.type}</CardType>
                                                </CardMeta>
                                            </CardInfo>
                                            <TypeBadge>{frameworkLabel}</TypeBadge>
                                        </CardHeader>

                                        <StatusRow>
                                            <StatusDot $color="hsl(var(--success))" />
                                            Active
                                        </StatusRow>

                                        <Divider />

                                        {(mem.agentCount ?? 0) > 0 && (
                                            <AgentCountBadge>
                                                <Users size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                                                Used by {mem.agentCount} agent{mem.agentCount !== 1 ? 's' : ''}
                                            </AgentCountBadge>
                                        )}

                                        <UpdatedLabel>
                                            Updated {new Date(mem.updatedAt).toLocaleDateString()}
                                        </UpdatedLabel>

                                        <CardActions>
                                            {mem.type !== 'AdkInMemory' && (
                                                <VerifyBtn onClick={() => handleVerify(mem)} disabled={verifying[mem.id!]}>
                                                    {verifying[mem.id!] ? <><VerifySpinner size={12} /> Checking...</> : <><Wifi size={12} /> Verify</>}
                                                </VerifyBtn>
                                            )}
                                            {canWrite && <EditBtn onClick={() => openEdit(mem)}>Edit</EditBtn>}
                                            {canAdmin && <DeleteBtn onClick={() => setAppToDelete(mem)}>Remove</DeleteBtn>}
                                        </CardActions>
                                        {verifyResult[mem.id!] && (
                                            <VerifyStatus $success={verifyResult[mem.id!].success}>
                                                {verifyResult[mem.id!].success ? <Wifi size={12} /> : <WifiOff size={12} />}
                                                {verifyResult[mem.id!].message}
                                            </VerifyStatus>
                                        )}
                                    </Card>
                                );
                            })}
                        </CardsGrid>
                    )}
                </ContentColumn>
            </MainLayout>

            {modalProvider && (
                <MemoryModal
                    provider={modalProvider}
                    framework={modalFramework}
                    appToEdit={appToEdit}
                    onClose={closeModal}
                    onSaved={loadMemories}
                />
            )}
            <DeleteConfirmModal
                isOpen={!!appToDelete}
                onClose={() => setAppToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={appToDelete?.name ?? ''}
                description={(appToDelete?.agentCount ?? 0) > 0
                    ? `This memory store is used by ${appToDelete!.agentCount} agent${appToDelete!.agentCount !== 1 ? 's' : ''}. Remove it from those agents first.`
                    : undefined}
            />
        </PageWrapper>
    );
};

export default MemoryPage;
