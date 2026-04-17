import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled, { keyframes } from 'styled-components';
import { Eye, EyeOff, X, BookOpen, GitPullRequest, Search, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { fetchApplications, deleteApplication, createApplication, updateApplication, checkObservabilityConnection, mapConfigToApi, mapTypeToProvider } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';
import type { AppType } from '../../types/application.types';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import { useProject } from '../../hooks/use-project';
import useWorkspace from '../../hooks/use-workspace';
import NoProjectState from '../../components/general/no-project-state/component';

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
    group: string;
    fields: ProviderField[];
    comingSoon?: boolean;
}

const OBS_PROVIDERS: ProviderMeta[] = [
    { id: 'Langfuse', label: 'Langfuse', logo: '/img/langfuse-logo.png', group: 'LLM Observability', description: 'Open-source LLM observability, analytics, and evaluation', fields: [
        { key: 'host', label: 'Host URL', type: 'url', placeholder: 'https://cloud.langfuse.com', required: true },
        { key: 'publicKey', label: 'Public Key', type: 'text', placeholder: 'pk-lf-...', required: true },
        { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'sk-lf-...', required: true },
    ]},
    { id: 'Phoenix', label: 'Phoenix', logo: '/img/phoenix-logo.png', group: 'LLM Observability', description: 'AI observability and evaluation from Arize', fields: [
        { key: 'host', label: 'Host URL', type: 'url', placeholder: 'http://localhost:6006', required: true },
        { key: 'projectName', label: 'Project Name', type: 'text', placeholder: 'my-project' },
    ]},
    { id: 'LangSmith', label: 'LangSmith', logo: '/img/langsmith-logo.png', group: 'LLM Observability', description: 'LangChain tracing, evaluation, and monitoring', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'ls__...', required: true },
        { key: 'projectName', label: 'Project Name', type: 'text', placeholder: 'my-project' },
        { key: 'endpoint', label: 'Endpoint', type: 'text', placeholder: 'https://api.smith.langchain.com' },
    ]},
    { id: 'GoogleCloudLogging', label: 'GCP Logging', logo: '/img/google-cloud-logo.svg', group: 'Cloud', description: 'Google Cloud structured logging', fields: [
        { key: 'gcpProjectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-gcp-project', required: true },
        { key: 'region', label: 'Region', type: 'text', placeholder: 'us-central1' },
    ]},
    { id: 'GoogleCloudTrace', label: 'GCP Trace', logo: '/img/google-cloud-logo.svg', group: 'Cloud', description: 'Google Cloud distributed tracing', fields: [
        { key: 'gcpProjectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-gcp-project', required: true },
        { key: 'region', label: 'Region', type: 'text', placeholder: 'us-central1' },
    ]},
    // Coming soon
    { id: 'Datadog' as AppType, label: 'Datadog APM', logo: '/img/datadog-logo.svg', group: 'Coming Soon', description: 'Distributed tracing', fields: [], comingSoon: true },
    { id: 'AWSXRay' as AppType, label: 'AWS X-Ray', logo: '/img/aws-logo.png', group: 'Coming Soon', description: 'AWS distributed tracing', fields: [], comingSoon: true },
    { id: 'AzureMonitor' as AppType, label: 'Azure Monitor', logo: '/img/azure-logo.png', group: 'Coming Soon', description: 'Application Insights', fields: [], comingSoon: true },
    { id: 'Jaeger' as AppType, label: 'Jaeger', logo: '/img/jaeger-logo.svg', group: 'Coming Soon', description: 'Open-source distributed tracing', fields: [], comingSoon: true },
];

const PROVIDER_GROUPS = ['LLM Observability', 'Cloud', 'Coming Soon'];

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

// ── Left column: provider picker ─────────────────────────────────────────────

const ProviderColumn = styled.div`
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
    margin: 20px 0 8px 10px;

    &:first-child { margin-top: 0; }
`;

const ProviderBtn = styled.button<{ $disabled?: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: ${p => p.$disabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--text-secondary))'};
    font-size: 13px;
    font-weight: 400;
    cursor: ${p => p.$disabled ? 'default' : 'pointer'};
    opacity: ${p => p.$disabled ? 0.5 : 1};
    transition: all 0.15s ease;
    text-align: left;
    margin-bottom: 2px;

    &:hover {
        background: ${p => p.$disabled ? 'transparent' : 'var(--overlay-light)'};
        color: ${p => p.$disabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))'};
    }
`;

const ProviderLogo = styled.span`
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;

    img {
        width: 20px;
        height: 20px;
        object-fit: contain;
    }
`;

const AddIndicator = styled.span`
    margin-left: auto;
    font-size: 16px;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;

    ${ProviderBtn}:hover & {
        opacity: 1;
    }
`;

const ComingSoonBadge = styled.span`
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--overlay-light);
    color: hsl(var(--muted-foreground));
    margin-left: auto;
    flex-shrink: 0;
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

const RequestIcon = styled.span`
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: hsl(var(--primary));
`;

// ── Right column: configs + empty state ──────────────────────────────────────

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
    background: var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;

    img { width: 24px; height: 24px; object-fit: contain; }
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

const StatusBadge = styled.span<{ $active: boolean }>`
    font-size: 10px;
    font-weight: 600;
    padding: 3px 8px;
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
    gap: 6px;
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
    max-width: 160px;
`;

const SecretValue = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 160px;
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
`;

const CardActions = styled.div`
    display: flex;
    gap: 8px;
    margin-top: auto;
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
    color: #f87171;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: rgba(248, 113, 113, 0.18); }
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

// ── Per-provider modal ───────────────────────────────────────────────────────

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

// ── Per-provider modal component ─────────────────────────────────────────────

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
    const { t } = useTranslation();
    const { selectedProjectId, projects, isLoadingProjects, currentProject, canWrite, canAdmin } = useProject();
    const { isCurrentWorkspaceOwner } = useWorkspace();
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalProvider, setModalProvider] = useState<ProviderMeta | null>(null);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);
    const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);
    const [verifying, setVerifying] = useState<Record<string, boolean>>({});
    const [verifyResult, setVerifyResult] = useState<Record<string, { success: boolean; message: string }>>({});

    const openModal = (provider: ProviderMeta, app?: ApplicationConfig) => {
        setModalProvider(provider);
        setAppToEdit(app ?? null);
    };
    const closeModal = () => { setModalProvider(null); setAppToEdit(null); };

    const loadApps = useCallback(async () => {
        if (!currentProject) {
            setApps([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const all = await fetchApplications();
            setApps(all.filter(a => a.category === 'Observability'));
        } catch (e) {
            console.error('Failed to load observability apps', e);
        } finally {
            setIsLoading(false);
        }
    }, [currentProject]);

    useEffect(() => { loadApps(); }, [loadApps]);

    const handleVerify = async (app: ApplicationConfig) => {
        if (!app.id) return;
        setVerifying(prev => ({ ...prev, [app.id!]: true }));
        setVerifyResult(prev => { const next = { ...prev }; delete next[app.id!]; return next; });
        try {
            const result = await checkObservabilityConnection({
                provider: mapTypeToProvider(app.type),
                enabled: true,
                config: mapConfigToApi(app.type, app.config),
            });
            setVerifyResult(prev => ({ ...prev, [app.id!]: { success: result.success, message: result.message } }));
            setTimeout(() => setVerifyResult(prev => { const next = { ...prev }; delete next[app.id!]; return next; }), 10000);
        } catch {
            setVerifyResult(prev => ({ ...prev, [app.id!]: { success: false, message: 'Request failed' } }));
            setTimeout(() => setVerifyResult(prev => { const next = { ...prev }; delete next[app.id!]; return next; }), 10000);
        } finally {
            setVerifying(prev => ({ ...prev, [app.id!]: false }));
        }
    };

    const handleDeleteConfirm = async () => {
        if (!appToDelete?.id) return;
        await deleteApplication(appToDelete.id);
        setAppToDelete(null);
        loadApps();
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
                pageTitle="Observability"
                pageSubtitle="Monitor and trace AI agent activity."
            />
        );
    }

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Observability</PageTitle>
                    <PageSubtitle>
                        {currentProject
                            ? `Monitor and trace AI agent activity in ${currentProject.name}`
                            : 'Select a project to manage observability'}
                    </PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={14} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                        <SearchInput placeholder="Search providers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </SearchBar>
                    <DocsButton href="https://docs.idunplatform.com/observability/overview" target="_blank" rel="noopener noreferrer">
                        <BookOpen size={15} /> Docs
                    </DocsButton>
                </HeaderActions>
            </PageHeader>

            <MainLayout>
                {/* ── Left: Provider picker ──────────────────────── */}
                <ProviderColumn>
                    {PROVIDER_GROUPS.map(group => {
                        const providers = OBS_PROVIDERS.filter(p => p.group === group);
                        if (providers.length === 0) return null;
                        return (
                            <React.Fragment key={group}>
                                <GroupLabel>{group}</GroupLabel>
                                {providers.map(p => (
                                    <ProviderBtn
                                        key={p.id}
                                        type="button"
                                        $disabled={!!p.comingSoon}
                                        onClick={() => { if (!p.comingSoon && canWrite) openModal(p); }}
                                    >
                                        <ProviderLogo><img src={p.logo} alt={p.label} /></ProviderLogo>
                                        {p.label}
                                        {p.comingSoon ? <ComingSoonBadge>Soon</ComingSoonBadge> : <AddIndicator>+</AddIndicator>}
                                    </ProviderBtn>
                                ))}
                            </React.Fragment>
                        );
                    })}

                    <RequestBtn
                        type="button"
                        onClick={() => window.open('https://github.com/Idun-Group/idun-agent-platform/issues/new?labels=enhancement&template=feature_request.md&title=%5BObservability%5D+New+provider+request', '_blank')}
                    >
                        <RequestIcon><GitPullRequest size={15} /></RequestIcon>
                        Request a provider
                    </RequestBtn>
                </ProviderColumn>

                {/* ── Right: Configured providers ────────────────── */}
                <ContentColumn>
                    {!currentProject ? (
                        <CenterBox>
                            <LoadingSpinner />
                            <p>Select a project from the top navbar to manage observability providers.</p>
                        </CenterBox>
                    ) : isLoading ? (
                        <CenterBox>
                            <LoadingSpinner />
                            <p>Loading…</p>
                        </CenterBox>
                    ) : apps.length === 0 ? (
                        <EmptyState>
                            {canWrite ? (
                                <>
                                    <EmptyTitle>Connect a provider to get started</EmptyTitle>
                                    <EmptyDescription>
                                        Full AI agent monitoring and visibility into every run. Idun auto-instruments your agents with OpenTelemetry and routes traces to any backend without any configuration.
                                    </EmptyDescription>
                                    <EmptyChips>
                                        <Chip $color="#3b82f6">Logging</Chip>
                                        <Chip $color="#f59e0b">Debug</Chip>
                                        <Chip $color="#10b981">Cost tracking</Chip>
                                        <Chip $color="#8b5cf6">Token usage</Chip>
                                        <Chip $color="#ef4444">Latency</Chip>
                                        <Chip $color="#06b6d4">AI compliance</Chip>
                                    </EmptyChips>
                                </>
                            ) : (
                                <>
                                    <EmptyTitle>
                                        {t('scopedEmpty.observability.readerTitle', 'No observability providers configured in {{project}}', { project: currentProject.name })}
                                    </EmptyTitle>
                                    <EmptyDescription>
                                        {t('scopedEmpty.observability.readerDescription', 'Ask a contributor or admin to connect one.')}
                                    </EmptyDescription>
                                </>
                            )}
                        </EmptyState>
                    ) : (
                        <CardsGrid>
                            {apps.filter(a => {
                                if (!searchTerm) return true;
                                const term = searchTerm.toLowerCase();
                                return (a.name?.toLowerCase().includes(term) || a.type?.toLowerCase().includes(term));
                            }).map(app => {
                                const config = flattenConfig(app.config);
                                const configEntries = Object.entries(config);
                                const providerMeta = OBS_PROVIDERS.find(p => p.id === app.type);
                                return (
                                    <Card key={app.id}>
                                        <CardHeader>
                                            <CardInfo>
                                                <CardIcon><img src={app.imageUrl} alt={app.type ?? ''} /></CardIcon>
                                                <CardMeta>
                                                    <CardName>{app.name}</CardName>
                                                    <CardType>{app.type}</CardType>
                                                </CardMeta>
                                            </CardInfo>
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
                                            <VerifyBtn onClick={() => handleVerify(app)} disabled={verifying[app.id!]}>
                                                {verifying[app.id!] ? <><VerifySpinner size={12} /> Checking...</> : <><Wifi size={12} /> Verify</>}
                                            </VerifyBtn>
                                            {canWrite && <EditBtn onClick={() => providerMeta && openModal(providerMeta, app)}>Edit</EditBtn>}
                                            {canAdmin && <DeleteBtn onClick={() => setAppToDelete(app)}>Remove</DeleteBtn>}
                                        </CardActions>
                                        {verifyResult[app.id!] && (
                                            <VerifyStatus $success={verifyResult[app.id!].success}>
                                                {verifyResult[app.id!].success ? <Wifi size={12} /> : <WifiOff size={12} />}
                                                {verifyResult[app.id!].message}
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
