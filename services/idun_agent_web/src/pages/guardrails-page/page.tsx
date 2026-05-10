import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
    BookOpen,
    AlertCircle,
    Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchApplications, deleteApplication, createApplication, updateApplication } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';
import type { AppType } from '../../types/application.types';
import {
    PII_ENTITY_VALUES,
    validateGuardrailForm,
    isSupportedGuardrailType,
} from '../../services/guardrail-payloads';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import { CapabilityCatalog } from '../../components/capability-catalog';
import type { CapabilityItem } from '../../components/capability-catalog';
import { Drawer } from '../../components/drawer';

// ── Guardrail type metadata ──────────────────────────────────────────────────

interface GuardrailMeta {
    icon: LucideIcon;
    group: string;
    description: string;
    comingSoon?: boolean;
}

const TYPE_META: Record<string, GuardrailMeta> = {
    BanList:          { icon: Ban, group: 'Content Safety', description: 'Block specific words or phrases' },
    NSFWText:         { icon: ShieldAlert, group: 'Content Safety', description: 'Filter adult or inappropriate content' },
    ToxicLanguage:    { icon: Skull, group: 'Content Safety', description: 'Filter hate speech and toxic content' },
    GibberishText:    { icon: Type, group: 'Content Safety', description: 'Detect meaningless or garbled text' },
    CodeScanner:      { icon: Code2, group: 'Content Safety', description: 'Restrict code generation languages', comingSoon: true },
    DetectPII:        { icon: Lock, group: 'Identity & Security', description: 'Detect and mask personal information' },
    DetectJailbreak:  { icon: LockKeyhole, group: 'Identity & Security', description: 'Detect jailbreak attempts', comingSoon: true },
    PromptInjection:  { icon: ShieldAlert, group: 'Identity & Security', description: 'Prevent prompt injection attacks', comingSoon: true },
    ModelArmor:       { icon: Shield, group: 'Enterprise', description: 'Enterprise-grade content filtering', comingSoon: true },
    CustomLLM:        { icon: Bot, group: 'Enterprise', description: 'Custom LLM-based evaluation', comingSoon: true },
    BiasCheck:        { icon: Scale, group: 'Context & Quality', description: 'Detect biased content' },
    CompetitionCheck: { icon: Trophy, group: 'Context & Quality', description: 'Prevent competitor mentions' },
    CorrectLanguage:  { icon: Globe, group: 'Context & Quality', description: 'Enforce specific languages' },
    RestrictTopic:    { icon: Target, group: 'Context & Quality', description: 'Limit to allowed topics' },
    RagHallucination: { icon: Brain, group: 'Context & Quality', description: 'Detect RAG hallucinations', comingSoon: true },
};

const GROUPS = ['Content Safety', 'Identity & Security', 'Enterprise', 'Context & Quality'];

const guardSlug = (id: string) =>
    id
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase();

const groupTranslationKey = (group: string) => {
    if (group === 'Content Safety') return 'admin.guardrails.group.content_safety';
    if (group === 'Identity & Security') return 'admin.guardrails.group.identity_security';
    if (group === 'Enterprise') return 'admin.guardrails.group.enterprise';
    if (group === 'Context & Quality') return 'admin.guardrails.group.context_quality';
    return group;
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

// ── Header buttons ───────────────────────────────────────────────────────────

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

const ApiKeyBtn = styled.button`
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
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
        color: hsl(var(--foreground));
        border-color: var(--border-medium);
        background: var(--overlay-medium);
    }
`;

const RequiredBadge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.25);
`;

// ── Search bar (header) ──────────────────────────────────────────────────────

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

const LOCALSTORAGE_KEY = 'guardrails_api_key';

const DropdownWrapper = styled.div`
    position: relative;
`;

const DropdownPanel = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 100;
    background: hsl(var(--card));
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 16px;
    min-width: 360px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const DropdownRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const DropdownInput = styled.input`
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

const DropdownVisBtn = styled.button`
    background: transparent;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;

    &:hover { color: hsl(var(--foreground)); }
`;

const DropdownSaveBtn = styled.button<{ $saved?: boolean }>`
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

const DropdownLink = styled.a`
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: hsl(var(--primary));
    text-decoration: none;
    white-space: nowrap;

    &:hover { text-decoration: underline; }
`;

// ── Stacked sections ─────────────────────────────────────────────────────────

const SectionDivider = styled.hr`
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 4px 0;
`;

const ConfiguredSection = styled.section`
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
`;

const ConfiguredHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const SectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: hsl(var(--muted-foreground));
`;

const PrimaryButton = styled.button`
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    &:hover { opacity: 0.9; }
`;

const EmptyHint = styled.div`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    padding: 20px 0;
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

const GroupBadge = styled.span`
    font-size: 10px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 20px;
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.2);
    white-space: nowrap;
`;

const CardDesc = styled.p`
    font-size: 12px;
    color: hsl(var(--text-secondary));
    margin: 0;
    line-height: 1.4;
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
    align-items: flex-start;
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
    word-break: break-all;
    max-width: 160px;
    text-align: right;
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

// ── Per-guardrail field definitions ──────────────────────────────────────────

interface GuardrailField {
    key: string;
    label: string;
    type: 'text' | 'password' | 'number' | 'textarea' | 'multicheck';
    placeholder?: string;
    required?: boolean;
    hint?: string;
    options?: readonly string[];
}

const API_KEY_FIELD: GuardrailField = {
    key: 'api_key', label: 'Guardrails AI API Key', type: 'password',
    placeholder: 'Your Guardrails AI API key', required: true, hint: 'Get your key at hub.guardrailsai.com',
};
const REJECT_FIELD: GuardrailField = {
    key: 'reject_message', label: 'Rejection Message', type: 'text',
    placeholder: 'Message shown when this guardrail triggers', hint: 'Leave empty for default',
};

const GUARDRAIL_FIELDS: Record<string, GuardrailField[]> = {
    BanList: [API_KEY_FIELD, { key: 'banned_words', label: 'Banned Words / Phrases', type: 'textarea', placeholder: 'word1\nword2\nphrase to ban', hint: 'One word or phrase per line', required: true }, REJECT_FIELD],
    NSFWText: [API_KEY_FIELD, { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' }, REJECT_FIELD],
    ToxicLanguage: [API_KEY_FIELD, { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' }, REJECT_FIELD],
    GibberishText: [API_KEY_FIELD, { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' }, REJECT_FIELD],
    DetectPII: [API_KEY_FIELD, { key: 'pii_entities', label: 'PII Entities to Detect', type: 'multicheck', required: true, options: PII_ENTITY_VALUES, hint: 'Select entities to detect' }, REJECT_FIELD],
    BiasCheck: [API_KEY_FIELD, { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' }, REJECT_FIELD],
    CompetitionCheck: [API_KEY_FIELD, { key: 'competitors', label: 'Competitor Names', type: 'textarea', placeholder: 'CompetitorA\nCompetitorB', hint: 'One name per line' }, REJECT_FIELD],
    CorrectLanguage: [API_KEY_FIELD, { key: 'expected_languages', label: 'Expected Languages', type: 'textarea', placeholder: 'en\nfr\nde', hint: 'One language code per line' }, REJECT_FIELD],
    RestrictTopic: [API_KEY_FIELD, { key: 'valid_topics', label: 'Allowed Topics', type: 'textarea', placeholder: 'customer support\nproduct information\ntechnical help', hint: 'One topic per line' }, REJECT_FIELD],
};

const GUARDRAIL_LABELS: Record<string, string> = {
    BanList: 'Ban List', NSFWText: 'NSFW Text', ToxicLanguage: 'Toxic Language',
    GibberishText: 'Gibberish Text', DetectPII: 'Detect PII', BiasCheck: 'Bias Check',
    CompetitionCheck: 'Competition Check', CorrectLanguage: 'Correct Language', RestrictTopic: 'Restrict Topic',
};

// ── Drawer form styled components ────────────────────────────────────────────

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

const Hint = styled.p`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    margin: 4px 0 0;
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

const Textarea = styled.textarea`
    width: 100%;
    padding: 10px 14px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: monospace;
    outline: none;
    box-sizing: border-box;
    resize: vertical;
    min-height: 80px;
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

const CheckboxGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const CheckboxLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: hsl(var(--text-secondary));
    transition: all 0.15s;

    &:hover {
        background: var(--overlay-light);
        border-color: hsl(var(--primary) / 0.3);
    }

    input[type="checkbox"] {
        accent-color: hsl(var(--primary));
        width: 16px;
        height: 16px;
        cursor: pointer;
    }
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

const FormFooter = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 20px;
    margin-top: 8px;
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

// ── Per-guardrail drawer component ───────────────────────────────────────────

interface GuardrailDrawerProps {
    open: boolean;
    typeId: string | null;
    appToEdit: ApplicationConfig | null;
    defaultApiKey: string;
    onClose: () => void;
    onSaved: () => void;
}

const GuardrailDrawer: React.FC<GuardrailDrawerProps> = ({ open, typeId, appToEdit, defaultApiKey, onClose, onSaved }) => {
    const { t } = useTranslation();
    const fields = typeId ? GUARDRAIL_FIELDS[typeId] ?? [] : [];
    const label = typeId ? GUARDRAIL_LABELS[typeId] ?? typeId : '';
    const isEditMode = !!appToEdit;

    const [name, setName] = useState('');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (appToEdit) {
            setName(appToEdit.name ?? '');
            const cfg = (appToEdit.config ?? {}) as Record<string, unknown>;
            const strCfg: Record<string, string> = {};
            for (const k in cfg) {
                const v = cfg[k];
                if (v !== null && v !== undefined) strCfg[k] = typeof v === 'string' ? v : String(v);
            }
            setFormValues(strCfg);
        } else {
            setName('');
            setFormValues(defaultApiKey ? { api_key: defaultApiKey } : {});
        }
        setErrorMessage(null);
        setVisiblePasswords({});
    }, [appToEdit, typeId, defaultApiKey]);

    const handleChange = (key: string, value: string) => {
        setFormValues(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        if (!typeId) return;

        if (isSupportedGuardrailType(typeId as AppType)) {
            const errors = validateGuardrailForm(typeId as AppType, formValues);
            if (errors.length > 0) {
                setErrorMessage(errors.map((err: { message: string }) => err.message).join('. '));
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const finalName = name.trim() || label;
            if (isEditMode && appToEdit?.id) {
                await updateApplication(appToEdit.id, { name: finalName, type: typeId as AppType, category: 'Guardrails', config: formValues });
            } else {
                await createApplication({ name: finalName, type: typeId as AppType, category: 'Guardrails', config: formValues });
            }
            onSaved();
            onClose();
        } catch (err: unknown) {
            setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSubmitting(false);
        }
    };

    const drawerTitle = typeId
        ? (isEditMode
            ? t('admin.guardrails.drawer_title_edit', `Edit ${label}`)
            : label)
        : '';

    return (
        <Drawer open={open} onClose={onClose} title={drawerTitle}>
            <form onSubmit={handleSubmit}>
                {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                <FieldGroup>
                    <Label htmlFor="guardrail-name">Guardrail Name</Label>
                    <Input
                        id="guardrail-name"
                        type="text"
                        placeholder={label}
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                </FieldGroup>

                {fields.map(field => (
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
                                    onChange={e => handleChange(field.key, e.target.value)}
                                    style={{ paddingRight: 40 }}
                                />
                                <PasswordToggleBtn type="button" onClick={() => setVisiblePasswords(prev => ({ ...prev, [field.key]: !prev[field.key] }))}>
                                    {visiblePasswords[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                                </PasswordToggleBtn>
                            </PasswordWrapper>
                        ) : field.type === 'textarea' ? (
                            <Textarea
                                id={field.key}
                                placeholder={field.placeholder}
                                value={formValues[field.key] ?? ''}
                                onChange={e => handleChange(field.key, e.target.value)}
                            />
                        ) : field.type === 'number' ? (
                            <Input
                                id={field.key}
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                placeholder={field.placeholder}
                                value={formValues[field.key] ?? ''}
                                onChange={e => handleChange(field.key, e.target.value)}
                            />
                        ) : field.type === 'multicheck' && field.options ? (
                            <CheckboxGrid>
                                {field.options.map(opt => {
                                    const selected = (formValues[field.key] ?? '').split(',').filter(Boolean);
                                    const isChecked = selected.includes(opt);
                                    return (
                                        <CheckboxLabel key={opt}>
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => {
                                                    const next = isChecked
                                                        ? selected.filter(s => s !== opt)
                                                        : [...selected, opt];
                                                    handleChange(field.key, next.join(','));
                                                }}
                                            />
                                            {opt}
                                        </CheckboxLabel>
                                    );
                                })}
                            </CheckboxGrid>
                        ) : (
                            <Input
                                id={field.key}
                                type="text"
                                placeholder={field.placeholder}
                                value={formValues[field.key] ?? ''}
                                onChange={e => handleChange(field.key, e.target.value)}
                            />
                        )}

                        {field.hint && <Hint>{field.hint}</Hint>}
                    </FieldGroup>
                ))}

                <FormFooter>
                    <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                    <SubmitBtn type="submit" disabled={isSubmitting}>
                        {isSubmitting && <SmallSpinner />}
                        {isEditMode ? 'Save Changes' : `Add ${label}`}
                    </SubmitBtn>
                </FormFooter>
            </form>
        </Drawer>
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const truncate = (s: string, max = 28) => s.length > max ? s.slice(0, max) + '…' : s;

// ── Main Page ─────────────────────────────────────────────────────────────────

const GuardrailsPage: React.FC = () => {
    const { t } = useTranslation();
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // API key dropdown
    const [globalApiKey, setGlobalApiKey] = useState(() => localStorage.getItem(LOCALSTORAGE_KEY) ?? '');
    const [apiKeySaved, setApiKeySaved] = useState(() => !!localStorage.getItem(LOCALSTORAGE_KEY));
    const [showApiKey, setShowApiKey] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Drawer
    const [modalTypeId, setModalTypeId] = useState<string | null>(null);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Delete
    const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);

    // Click outside dropdown
    useEffect(() => {
        if (!dropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [dropdownOpen]);

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

    const openCreate = (typeId: string) => {
        setAppToEdit(null);
        setModalTypeId(typeId);
        setIsDrawerOpen(true);
    };
    const openEdit = (app: ApplicationConfig) => {
        setAppToEdit(app);
        setModalTypeId(app.type);
        setIsDrawerOpen(true);
    };
    const closeModal = () => {
        setIsDrawerOpen(false);
        setModalTypeId(null);
        setAppToEdit(null);
    };

    const handleSaveApiKey = () => {
        const trimmed = globalApiKey.trim();
        if (trimmed) localStorage.setItem(LOCALSTORAGE_KEY, trimmed);
        else localStorage.removeItem(LOCALSTORAGE_KEY);
        setApiKeySaved(true);
        setTimeout(() => setApiKeySaved(false), 2000);
    };

    const handleDeleteConfirm = async () => {
        if (!appToDelete?.id) return;
        await deleteApplication(appToDelete.id);
        setAppToDelete(null);
        loadApps();
    };

    const hasApiKey = !!localStorage.getItem(LOCALSTORAGE_KEY);

    const catalogItems: CapabilityItem[] = useMemo(
        () =>
            Object.entries(TYPE_META).map(([id, meta]) => {
                const Icon = meta.icon;
                const slug = guardSlug(id);
                return {
                    id,
                    label: id,
                    description: t(`admin.guardrails.guard.${slug}`, meta.description),
                    icon: <Icon size={20} />,
                    group: t(groupTranslationKey(meta.group), meta.group),
                    comingSoon: meta.comingSoon ?? false,
                };
            }),
        [t],
    );

    const translatedGroupOrder = useMemo(
        () => GROUPS.map(g => t(groupTranslationKey(g), g)),
        [t],
    );

    const filteredApps = apps.filter(a => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (a.name?.toLowerCase().includes(term) || a.type?.toLowerCase().includes(term));
    });

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>{t('admin.guardrails.title', 'Guardrails')}</PageTitle>
                    <PageSubtitle>{t('admin.guardrails.subtitle', 'Enforce safety rules and content policies on your agents')}</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={14} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                        <SearchInput placeholder="Search guardrails..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </SearchBar>
                    <DropdownWrapper ref={dropdownRef}>
                        <ApiKeyBtn type="button" onClick={() => setDropdownOpen(v => !v)}>
                            <KeyRound size={14} />
                            API Key
                            {!hasApiKey && (
                                <RequiredBadge>
                                    <AlertCircle size={11} /> Required
                                </RequiredBadge>
                            )}
                        </ApiKeyBtn>
                        {dropdownOpen && (
                            <DropdownPanel>
                                <DropdownRow>
                                    <DropdownInput
                                        type={showApiKey ? 'text' : 'password'}
                                        placeholder="Enter your Guardrails AI API key"
                                        value={globalApiKey}
                                        onChange={e => { setGlobalApiKey(e.target.value); setApiKeySaved(false); }}
                                    />
                                    <DropdownVisBtn type="button" onClick={() => setShowApiKey(v => !v)}>
                                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </DropdownVisBtn>
                                    <DropdownSaveBtn type="button" $saved={apiKeySaved} onClick={handleSaveApiKey}>
                                        {apiKeySaved ? <><Check size={14} /> Saved</> : 'Save'}
                                    </DropdownSaveBtn>
                                </DropdownRow>
                                <DropdownLink href="https://hub.guardrailsai.com" target="_blank" rel="noopener noreferrer">
                                    Get a key <ExternalLink size={12} />
                                </DropdownLink>
                            </DropdownPanel>
                        )}
                    </DropdownWrapper>
                    <HeaderBtn href="https://docs.idunplatform.com/guardrails/overview" target="_blank" rel="noopener noreferrer">
                        <BookOpen size={15} /> Docs
                    </HeaderBtn>
                </HeaderActions>
            </PageHeader>

            <CapabilityCatalog
                items={catalogItems}
                label={t('admin.guardrails.available_label', 'AVAILABLE GUARDS')}
                search={true}
                searchPlaceholder={t('admin.guardrails.search_placeholder', 'Search guards…')}
                groupOrder={translatedGroupOrder}
                onSelect={id => openCreate(id)}
            />

            <SectionDivider />

            <ConfiguredSection>
                <ConfiguredHeader>
                    <SectionLabel>
                        {t('admin.guardrails.configured_label', 'YOUR GUARDS')}
                        {apps.length > 0 && ` · ${apps.length} configured`}
                    </SectionLabel>
                    <PrimaryButton onClick={() => openCreate('BanList')}>
                        + {t('admin.guardrails.new_button', 'New guard')}
                    </PrimaryButton>
                </ConfiguredHeader>

                {isLoading ? (
                    <CenterBox>
                        <LoadingSpinner />
                        <p>Loading guardrails…</p>
                    </CenterBox>
                ) : apps.length === 0 ? (
                    <EmptyHint>
                        {t('admin.guardrails.empty_state', 'No guards yet — pick one from the catalog above to get started.')}
                    </EmptyHint>
                ) : (
                    <CardsGrid>
                        {filteredApps.map(app => {
                            const meta = TYPE_META[app.type] ?? { icon: Shield, group: 'Other', description: '' };
                            const config = flattenConfig(app.config);
                            const configEntries = Object.entries(config).filter(([k]) => k !== 'api_key');

                            return (
                                <Card key={app.id}>
                                    <CardHeader>
                                        <CardInfo>
                                            <CardIcon><meta.icon size={18} /></CardIcon>
                                            <CardMeta>
                                                <CardName>{app.name}</CardName>
                                                <CardType>{app.type}</CardType>
                                            </CardMeta>
                                        </CardInfo>
                                        <GroupBadge>{meta.group}</GroupBadge>
                                    </CardHeader>

                                    {meta.description && <CardDesc>{meta.description}</CardDesc>}

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

                                    {(app.agentCount ?? 0) > 0 && (
                                        <AgentCountBadge>
                                            Used by {app.agentCount} agent{app.agentCount !== 1 ? 's' : ''}
                                        </AgentCountBadge>
                                    )}

                                    <CardActions>
                                        <EditBtn onClick={() => openEdit(app)}>Edit</EditBtn>
                                        <DeleteBtn onClick={() => setAppToDelete(app)}>Remove</DeleteBtn>
                                    </CardActions>
                                </Card>
                            );
                        })}
                    </CardsGrid>
                )}
            </ConfiguredSection>

            <GuardrailDrawer
                open={isDrawerOpen}
                typeId={modalTypeId}
                appToEdit={appToEdit}
                defaultApiKey={globalApiKey.trim()}
                onClose={closeModal}
                onSaved={loadApps}
            />

            <DeleteConfirmModal
                isOpen={!!appToDelete}
                onClose={() => setAppToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={appToDelete?.name ?? ''}
                description={(appToDelete?.agentCount ?? 0) > 0
                    ? `This guardrail is used by ${appToDelete!.agentCount} agent${appToDelete!.agentCount !== 1 ? 's' : ''}. Remove the guardrail from those agents first.`
                    : undefined}
            />
        </PageWrapper>
    );
};

export default GuardrailsPage;
