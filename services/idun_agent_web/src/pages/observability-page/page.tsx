import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { Eye, EyeOff, ExternalLink, X, BookOpen, GitPullRequest } from 'lucide-react';
import { fetchApplications, deleteApplication, createApplication, updateApplication } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';
import type { AppType } from '../../types/application.types';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';

// ── Provider metadata ────────────────────────────────────────────────────────

interface ProviderField {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    placeholder?: string;
    required?: boolean;
}

interface ProviderMeta {
    id: AppType;
    label: string;
    logo: string;
    description: string;
    fields: ProviderField[];
}

const OBS_PROVIDERS: ProviderMeta[] = [
    {
        id: 'Langfuse', label: 'Langfuse', logo: '/img/langfuse-logo.png',
        description: 'Open-source LLM observability, analytics, and evaluation',
        fields: [
            { key: 'host', label: 'Host URL', type: 'url', placeholder: 'https://cloud.langfuse.com', required: true },
            { key: 'publicKey', label: 'Public Key', type: 'text', placeholder: 'pk-lf-...', required: true },
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'sk-lf-...', required: true },
        ],
    },
    {
        id: 'Phoenix', label: 'Phoenix', logo: '/img/phoenix-logo.png',
        description: 'AI observability and evaluation from Arize',
        fields: [
            { key: 'host', label: 'Host URL', type: 'url', placeholder: 'http://localhost:6006', required: true },
            { key: 'projectName', label: 'Project Name', type: 'text', placeholder: 'my-project' },
        ],
    },
    {
        id: 'LangSmith', label: 'LangSmith', logo: '/img/langsmith-logo.png',
        description: 'LangChain tracing, evaluation, and monitoring',
        fields: [
            { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'ls__...', required: true },
            { key: 'projectName', label: 'Project Name', type: 'text', placeholder: 'my-project' },
            { key: 'endpoint', label: 'Endpoint', type: 'text', placeholder: 'https://api.smith.langchain.com' },
        ],
    },
    {
        id: 'GoogleCloudLogging', label: 'GCP Logging', logo: '/img/google-cloud-logo.png',
        description: 'Google Cloud structured logging',
        fields: [
            { key: 'gcpProjectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-gcp-project', required: true },
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-central1' },
        ],
    },
    {
        id: 'GoogleCloudTrace', label: 'GCP Trace', logo: '/img/google-cloud-logo.png',
        description: 'Google Cloud distributed tracing',
        fields: [
            { key: 'gcpProjectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-gcp-project', required: true },
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-central1' },
        ],
    },
];

// ── Animations ──────────────────────────────────────────────────────────────

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;
const modalIn = keyframes`from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); }`;
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

const DocsButton = styled.a`
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

// ── Intro ────────────────────────────────────────────────────────────────────

const IntroBlock = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const IntroText = styled.p`
    font-size: 14px;
    line-height: 1.7;
    color: hsl(var(--text-secondary));
    margin: 0;
    max-width: 680px;
`;

const ChipRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const Chip = styled.span<{ $color: string }>`
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 20px;
    background: ${p => p.$color}12;
    color: ${p => p.$color};
    border: 1px solid ${p => p.$color}25;
`;

const SectionLabel = styled.h2`
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: hsl(var(--muted-foreground));
    margin: 8px 0 14px;
`;

// ── Grid ─────────────────────────────────────────────────────────────────────

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
`;

// ── Existing config cards ────────────────────────────────────────────────────

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
    overflow: hidden;
    flex-shrink: 0;
    img { width: 26px; height: 26px; object-fit: contain; }
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
    margin: 2px 0 0;
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

const VisitBtn = styled.a`
    flex: 1;
    padding: 8px;
    background: rgba(99, 179, 237, 0.08);
    border: 1px solid rgba(99, 179, 237, 0.25);
    border-radius: 8px;
    color: #63b3ed;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    &:hover { background: rgba(99, 179, 237, 0.18); }
`;

// ── Provider tiles ───────────────────────────────────────────────────────────

const ProviderTile = styled.button`
    display: flex;
    align-items: center;
    gap: 16px;
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 26px 28px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    min-height: 96px;

    &:hover {
        border-color: hsl(var(--primary) / 0.4);
        background: hsl(var(--primary) / 0.04);
        transform: translateY(-1px);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }
`;

const TileLogo = styled.div`
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: var(--overlay-light);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    img { width: 28px; height: 28px; object-fit: contain; }
`;

const TileContent = styled.div`
    flex: 1;
    min-width: 0;
`;

const TileLabel = styled.p`
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 3px;
`;

const TileDescription = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const TileArrow = styled.span`
    color: hsl(var(--muted-foreground));
    font-size: 18px;
    flex-shrink: 0;
    transition: transform 0.2s, color 0.2s;
    ${ProviderTile}:hover & {
        color: hsl(var(--primary));
        transform: translateX(2px);
    }
`;

// ── Coming soon tiles ────────────────────────────────────────────────────────

interface ComingSoonMeta {
    label: string;
    description: string;
    logo: string;
}

const COMING_SOON_PROVIDERS: ComingSoonMeta[] = [
    { label: 'Datadog APM', description: 'Distributed tracing', logo: '/img/datadog-logo.svg' },
    { label: 'AWS X-Ray', description: 'AWS distributed tracing and analysis', logo: '/img/aws-logo.png' },
    { label: 'Azure Monitor', description: 'Application Insights', logo: '/img/azure-logo.png' },
    { label: 'Jaeger', description: 'Open-source distributed tracing', logo: '/img/jaeger-logo.svg' },
];

const ComingSoonTile = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 26px 28px;
    min-height: 96px;
    opacity: 0.5;
`;

const ComingSoonIcon = styled.div`
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: var(--overlay-light);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    img { width: 28px; height: 28px; object-fit: contain; }
`;

const ComingSoonBadge = styled.span`
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--border-light);
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
`;


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

// ── Provider modal ───────────────────────────────────────────────────────────

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
    width: 520px;
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

const ModalLogo = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--overlay-light);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    img { width: 24px; height: 24px; object-fit: contain; }
`;

const ModalTitleBlock = styled.div`
    flex: 1;
`;

const ModalTitle = styled.h2`
    font-size: 17px;
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

const PasswordWrapper = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

const PasswordToggleBtn = styled.button`
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    &:hover { color: hsl(var(--foreground)); }
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const getProviderUrl = (app: ApplicationConfig): string | null => {
    const config = flattenConfig(app.config);
    switch (app.type) {
        case 'Langfuse':
        case 'Phoenix':
            return config.host || null;
        case 'LangSmith': {
            const endpoint = config.endpoint ?? '';
            if (endpoint.includes('eu.api.smith.langchain.com') || endpoint.includes('eu.smith.langchain.com')) return 'https://eu.smith.langchain.com';
            return 'https://smith.langchain.com';
        }
        case 'GoogleCloudLogging':
            return config.gcpProjectId ? `https://console.cloud.google.com/logs/query?project=${config.gcpProjectId}` : null;
        case 'GoogleCloudTrace':
            return config.gcpProjectId ? `https://console.cloud.google.com/traces/list?project=${config.gcpProjectId}` : null;
        default:
            return null;
    }
};

// ── SecretField ──────────────────────────────────────────────────────────────

const SecretField: React.FC<{ value: string }> = ({ value }) => {
    const [visible, setVisible] = useState(false);
    return (
        <SecretValue>
            <SecretText $visible={visible}>{visible ? value : '•'.repeat(Math.min(value.length, 12))}</SecretText>
            <EyeBtn type="button" onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={14} /> : <Eye size={14} />}</EyeBtn>
        </SecretValue>
    );
};

// ── Provider-specific modal ──────────────────────────────────────────────────

interface ProviderModalProps {
    provider: ProviderMeta;
    appToEdit: ApplicationConfig | null;
    onClose: () => void;
    onSaved: () => void;
}

const ProviderModal: React.FC<ProviderModalProps> = ({ provider, appToEdit, onClose, onSaved }) => {
    const isEditMode = !!appToEdit;
    const [integrationName, setIntegrationName] = useState('');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (appToEdit) {
            setIntegrationName(appToEdit.name ?? '');
            const cfg = appToEdit.config as Record<string, unknown> ?? {};
            const strCfg: Record<string, string> = {};
            for (const k in cfg) {
                const v = cfg[k];
                if (v !== null && v !== undefined) strCfg[k] = typeof v === 'string' ? v : JSON.stringify(v);
            }
            setFormValues(strCfg);
        } else {
            setIntegrationName('');
            setFormValues({});
        }
        setErrorMessage(null);
        setVisiblePasswords({});
    }, [appToEdit, provider.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const missing = provider.fields.filter(f => f.required && !formValues[f.key]?.trim());
        if (missing.length > 0) { setErrorMessage(`Required: ${missing.map(f => f.label).join(', ')}`); return; }
        setIsSubmitting(true);
        setErrorMessage(null);
        try {
            const name = integrationName.trim() || `${provider.label} Integration`;
            if (isEditMode && appToEdit?.id) {
                await updateApplication(appToEdit.id, { name, type: provider.id, category: 'Observability', config: formValues });
            } else {
                await createApplication({ name, type: provider.id, category: 'Observability', config: formValues });
            }
            onSaved();
            onClose();
        } catch (err: unknown) {
            setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Overlay onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <Modal>
                <ModalHeader>
                    <ModalLogo><img src={provider.logo} alt={provider.label} /></ModalLogo>
                    <ModalTitleBlock>
                        <ModalTitle>{isEditMode ? `Edit ${provider.label}` : `Connect ${provider.label}`}</ModalTitle>
                        <ModalSubtitle>{provider.description}</ModalSubtitle>
                    </ModalTitleBlock>
                    <CloseBtn type="button" onClick={onClose}><X size={16} /></CloseBtn>
                </ModalHeader>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <ModalBody>
                        {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                        <FieldGroup>
                            <Label htmlFor="integration-name">Integration Name</Label>
                            <Input
                                id="integration-name"
                                type="text"
                                placeholder={`${provider.label} Integration`}
                                value={integrationName}
                                onChange={e => setIntegrationName(e.target.value)}
                            />
                        </FieldGroup>

                        {provider.fields.map(field => (
                            <FieldGroup key={field.key}>
                                <Label htmlFor={field.key}>
                                    {field.label}{field.required && <Required> *</Required>}
                                </Label>
                                {field.type === 'password' ? (
                                    <PasswordWrapper>
                                        <Input
                                            id={field.key}
                                            type={visiblePasswords[field.key] ? 'text' : 'password'}
                                            placeholder={field.placeholder}
                                            value={formValues[field.key] ?? ''}
                                            onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                            style={{ paddingRight: 40 }}
                                        />
                                        <PasswordToggleBtn type="button" onClick={() => setVisiblePasswords(prev => ({ ...prev, [field.key]: !prev[field.key] }))}>
                                            {visiblePasswords[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </PasswordToggleBtn>
                                    </PasswordWrapper>
                                ) : (
                                    <Input
                                        id={field.key}
                                        type={field.type}
                                        placeholder={field.placeholder}
                                        value={formValues[field.key] ?? ''}
                                        onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                    />
                                )}
                            </FieldGroup>
                        ))}
                    </ModalBody>

                    <ModalFooter>
                        <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                        <SubmitBtn type="submit" disabled={isSubmitting}>
                            {isSubmitting && <SmallSpinner />}
                            {isEditMode ? 'Save Changes' : 'Connect'}
                        </SubmitBtn>
                    </ModalFooter>
                </form>
            </Modal>
        </Overlay>
    );
};

// ── Main page ────────────────────────────────────────────────────────────────

const ObservabilityPage: React.FC = () => {
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalProvider, setModalProvider] = useState<ProviderMeta | null>(null);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);

    const openModal = (provider: ProviderMeta, app?: ApplicationConfig) => {
        setModalProvider(provider);
        setAppToEdit(app ?? null);
    };
    const closeModal = () => { setModalProvider(null); setAppToEdit(null); };

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

    const hasConfigs = filtered.length > 0;

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Observability</PageTitle>
                    <PageSubtitle>Monitor and trace your AI agent activity</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <DocsButton href="https://idun-group.github.io/idun-agent-platform/observability/overview/" target="_blank" rel="noopener noreferrer">
                        <BookOpen size={15} /> Docs
                    </DocsButton>
                    <SearchBar>
                        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>🔍</span>
                        <SearchInput placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </SearchBar>
                </HeaderActions>
            </PageHeader>

            <IntroBlock>
                <IntroText>
                    Full AI agent monitoring and visibility into every run. Idun auto-instruments your agents with OpenTelemetry and routes traces to any backend without any configuration.
                </IntroText>
                <ChipRow>
                    <Chip $color="#3b82f6">Logging</Chip>
                    <Chip $color="#f59e0b">Debug</Chip>
                    <Chip $color="#10b981">Cost tracking</Chip>
                    <Chip $color="#8b5cf6">Token usage</Chip>
                    <Chip $color="#ef4444">Latency</Chip>
                    <Chip $color="#06b6d4">AI compliance</Chip>
                </ChipRow>
            </IntroBlock>

            {isLoading ? (
                <CenterBox><LoadingSpinner /><p>Loading…</p></CenterBox>
            ) : (
                <>
                    {hasConfigs && (
                        <div>
                            <SectionLabel>Connected</SectionLabel>
                            <Grid>
                                {filtered.map(app => {
                                    const config = flattenConfig(app.config);
                                    const configEntries = Object.entries(config);
                                    const providerUrl = getProviderUrl(app);
                                    const providerMeta = OBS_PROVIDERS.find(p => p.id === app.type);
                                    return (
                                        <Card key={app.id}>
                                            <CardHeader>
                                                <ProviderInfo>
                                                    <ProviderIcon><img src={app.imageUrl} alt={app.type ?? ''} /></ProviderIcon>
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
                                                                {isSecretKey(k) ? <SecretField value={v} /> : <ConfigValue title={v}>{v}</ConfigValue>}
                                                            </ConfigRow>
                                                        ))}
                                                    </ConfigList>
                                                </>
                                            )}
                                            {(app.agentCount ?? 0) > 0 && (
                                                <AgentCountBadge>Used by {app.agentCount} agent{app.agentCount !== 1 ? 's' : ''}</AgentCountBadge>
                                            )}
                                            <CardActions>
                                                {providerUrl && (
                                                    <VisitBtn href={providerUrl} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink size={13} /> Visit
                                                    </VisitBtn>
                                                )}
                                                <EditBtn onClick={() => providerMeta && openModal(providerMeta, app)}>Edit</EditBtn>
                                                <DeleteBtn onClick={() => setAppToDelete(app)}>Remove</DeleteBtn>
                                            </CardActions>
                                        </Card>
                                    );
                                })}
                            </Grid>
                        </div>
                    )}

                    <div>
                        <SectionLabel>Available Providers</SectionLabel>
                        <Grid>
                            {OBS_PROVIDERS.map(p => (
                                <ProviderTile key={p.id} onClick={() => openModal(p)}>
                                    <TileLogo><img src={p.logo} alt={p.label} /></TileLogo>
                                    <TileContent>
                                        <TileLabel>{p.label}</TileLabel>
                                        <TileDescription>{p.description}</TileDescription>
                                    </TileContent>
                                    <TileArrow>›</TileArrow>
                                </ProviderTile>
                            ))}
                        </Grid>
                    </div>

                    <div>
                        <SectionLabel>Coming Soon</SectionLabel>
                        <Grid>
                            {COMING_SOON_PROVIDERS.map(p => (
                                <ComingSoonTile key={p.label}>
                                    <ComingSoonIcon><img src={p.logo} alt={p.label} /></ComingSoonIcon>
                                    <TileContent>
                                        <TileLabel>{p.label}</TileLabel>
                                        <TileDescription>{p.description}</TileDescription>
                                    </TileContent>
                                    <ComingSoonBadge>Soon</ComingSoonBadge>
                                </ComingSoonTile>
                            ))}
                        </Grid>
                    </div>

                    <Grid>
                        <ProviderTile as="a" href="https://github.com/Idun-Group/idun-agent-platform/issues/new?labels=enhancement&template=feature_request.md&title=%5BObservability%5D+New+provider+request" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                            <TileLogo><GitPullRequest size={22} color="hsl(var(--primary))" /></TileLogo>
                            <TileContent>
                                <TileLabel>Request a provider</TileLabel>
                                <TileDescription>Need a different integration? Open a feature request.</TileDescription>
                            </TileContent>
                            <TileArrow>›</TileArrow>
                        </ProviderTile>
                    </Grid>
                </>
            )}

            {modalProvider && (
                <ProviderModal
                    provider={modalProvider}
                    appToEdit={appToEdit}
                    onClose={closeModal}
                    onSaved={loadApps}
                />
            )}

            <DeleteConfirmModal
                isOpen={!!appToDelete}
                onClose={() => setAppToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={appToDelete?.name ?? ''}
                description={(appToDelete?.agentCount ?? 0) > 0
                    ? `This observability config is used by ${appToDelete!.agentCount} agent${appToDelete!.agentCount !== 1 ? 's' : ''}. Remove it from those agents first.`
                    : undefined}
            />
        </PageWrapper>
    );
};

export default ObservabilityPage;
