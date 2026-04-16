import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createApplication, updateApplication } from '../../../services/applications';
import type { AppType, ApplicationConfig } from '../../../types/application.types';
import {
    PII_ENTITY_VALUES as PII_ENTITIES,
    validateGuardrailForm,
    isSupportedGuardrailType,
} from '../../../services/guardrail-payloads';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void | Promise<void>;
    appToEdit?: ApplicationConfig | null;
    defaultApiKey?: string;
}

type FieldType = 'text' | 'password' | 'number' | 'textarea' | 'select' | 'multicheck';

interface Field {
    key: string;
    label: string;
    type: FieldType;
    placeholder?: string;
    required?: boolean;
    hint?: string;
    options?: readonly string[];
}

interface GuardrailType {
    id: AppType;
    label: string;
    icon: LucideIcon;
    group: string;
    description: string;
    fields: Field[];
    comingSoon?: boolean;
}

const API_KEY_FIELD: Field = {
    key: 'api_key',
    label: 'Guardrails AI API Key',
    type: 'password',
    placeholder: 'Your Guardrails AI API key',
    required: true,
    hint: 'Get your key at hub.guardrailsai.com',
};

const REJECT_MESSAGE_FIELD: Field = {
    key: 'reject_message',
    label: 'Rejection Message',
    type: 'text',
    placeholder: 'Message shown when this guardrail triggers',
    hint: 'Leave empty for default',
};

const GUARDRAIL_TYPES: GuardrailType[] = [
    // Content Safety
    {
        id: 'BanList',
        label: 'Ban List',
        icon: Ban,
        group: 'Content Safety',
        description: 'Block specific words or phrases from appearing in responses',
        fields: [
            API_KEY_FIELD,
            { key: 'banned_words', label: 'Banned Words / Phrases', type: 'textarea', placeholder: 'word1\nword2\nphrase to ban', hint: 'One word or phrase per line', required: true },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'NSFWText',
        label: 'NSFW Text',
        icon: ShieldAlert,
        group: 'Content Safety',
        description: 'Detect and filter adult or inappropriate content',
        fields: [
            API_KEY_FIELD,
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'ToxicLanguage',
        label: 'Toxic Language',
        icon: Skull,
        group: 'Content Safety',
        description: 'Filter hate speech, threats, and toxic content',
        fields: [
            API_KEY_FIELD,
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'GibberishText',
        label: 'Gibberish Text',
        icon: Type,
        group: 'Content Safety',
        description: 'Detect random, meaningless or garbled text',
        fields: [
            API_KEY_FIELD,
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'CodeScanner',
        label: 'Code Scanner',
        icon: Code2,
        group: 'Content Safety',
        description: 'Restrict code generation to allowed programming languages',
        fields: [
            { key: 'allowed_languages', label: 'Allowed Languages', type: 'textarea', placeholder: 'python\njavascript\ntypescript', hint: 'One language per line' },
        ],
        comingSoon: true,
    },
    // Identity & Security
    {
        id: 'DetectPII',
        label: 'Detect PII',
        icon: Lock,
        group: 'Identity & Security',
        description: 'Detect and mask Personally Identifiable Information',
        fields: [
            API_KEY_FIELD,
            { key: 'pii_entities', label: 'PII Entities to Detect', type: 'multicheck', required: true, options: PII_ENTITIES, hint: 'Select entities to detect' },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'DetectJailbreak',
        label: 'Detect Jailbreak',
        icon: LockKeyhole,
        group: 'Identity & Security',
        description: 'Detect prompt injection and jailbreak attempts',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
        comingSoon: true,
    },
    {
        id: 'PromptInjection',
        label: 'Prompt Injection',
        icon: ShieldAlert,
        group: 'Identity & Security',
        description: 'Prevent prompt injection attacks',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
        comingSoon: true,
    },
    // Enterprise
    {
        id: 'ModelArmor',
        label: 'Model Armor',
        icon: Shield,
        group: 'Enterprise',
        description: 'Google Cloud Model Armor for enterprise-grade content filtering',
        fields: [
            { key: 'projectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-project-id', required: true },
            { key: 'location', label: 'Location', type: 'text', placeholder: 'us-central1', required: true },
            { key: 'templateId', label: 'Template ID', type: 'text', placeholder: 'my-template', required: true },
        ],
        comingSoon: true,
    },
    {
        id: 'CustomLLM',
        label: 'Custom LLM',
        icon: Bot,
        group: 'Enterprise',
        description: 'Use a custom LLM as a guardrail to evaluate responses',
        fields: [
            { key: 'model', label: 'Model', type: 'text', placeholder: 'gemini-2.5-flash', required: true },
            { key: 'prompt', label: 'System Prompt', type: 'textarea', placeholder: 'You are a content moderator. Respond with SAFE or UNSAFE only.', required: true },
        ],
        comingSoon: true,
    },
    // Context & Quality
    {
        id: 'BiasCheck',
        label: 'Bias Check',
        icon: Scale,
        group: 'Context & Quality',
        description: 'Detect and filter biased content in responses',
        fields: [
            API_KEY_FIELD,
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'CompetitionCheck',
        label: 'Competition Check',
        icon: Trophy,
        group: 'Context & Quality',
        description: 'Prevent mention of competitor brands or products',
        fields: [
            API_KEY_FIELD,
            { key: 'competitors', label: 'Competitor Names', type: 'textarea', placeholder: 'CompetitorA\nCompetitorB', hint: 'One name per line' },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'CorrectLanguage',
        label: 'Correct Language',
        icon: Globe,
        group: 'Context & Quality',
        description: 'Enforce responses in specific languages only',
        fields: [
            API_KEY_FIELD,
            { key: 'expected_languages', label: 'Expected Languages', type: 'textarea', placeholder: 'en\nfr\nde', hint: 'One language code per line' },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'RestrictTopic',
        label: 'Restrict Topic',
        icon: Target,
        group: 'Context & Quality',
        description: 'Limit conversations to specific allowed topics',
        fields: [
            API_KEY_FIELD,
            { key: 'valid_topics', label: 'Allowed Topics', type: 'textarea', placeholder: 'customer support\nproduct information\ntechnical help', hint: 'One topic per line' },
            REJECT_MESSAGE_FIELD,
        ],
    },
    {
        id: 'RagHallucination',
        label: 'RAG Hallucination',
        icon: Brain,
        group: 'Context & Quality',
        description: 'Detect hallucinations in RAG-based responses',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
        comingSoon: true,
    },
];

const GROUPS = ['Content Safety', 'Identity & Security', 'Enterprise', 'Context & Quality'];

const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

// ── Styled Components ─────────────────────────────────────────────────────────

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Modal = styled.div`
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(16px);
    border-radius: 16px;
    width: 860px;
    max-width: 96vw;
    max-height: 88vh;
    display: flex;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
    position: relative;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const Sidebar = styled.div`
    width: 240px;
    flex-shrink: 0;
    background: rgba(12, 92, 171, 0.1);
    border-right: 1px solid rgba(255, 255, 255, 0.04);
    padding: 20px 10px;
    overflow-y: auto;
`;

const GroupLabel = styled.p`
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #4a5568;
    margin: 16px 0 6px 10px;

    &:first-child { margin-top: 0; }
`;

const TypeBtn = styled.button<{ $selected: boolean; $disabled?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid ${p => p.$selected ? '#0C5CAB' : 'transparent'};
    background: ${p => p.$selected ? 'rgba(12, 92, 171, 0.15)' : 'transparent'};
    color: ${p => p.$disabled ? '#8899a6' : p.$selected ? '#0C5CAB' : '#6b7a8d'};
    font-size: 13px;
    font-weight: ${p => p.$selected ? 600 : 400};
    cursor: ${p => p.$disabled ? 'default' : 'pointer'};
    opacity: ${p => p.$disabled ? 0.6 : 1};
    transition: all 0.15s ease;
    text-align: left;
    margin-bottom: 2px;

    &:hover {
        background: ${p => p.$disabled ? 'transparent' : 'rgba(255, 255, 255, 0.04)'};
        color: ${p => p.$disabled ? '#8899a6' : '#e1e4e8'};
    }
`;

const TypeIcon = styled.span`
    font-size: 15px;
    line-height: 1;
    flex-shrink: 0;
`;

const ComingSoonBadge = styled.span`
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    color: #8899a6;
    margin-left: auto;
    flex-shrink: 0;
`;

const RightPanel = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
`;

const PanelHeader = styled.div`
    padding: 22px 26px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const PanelTitle = styled.h2`
    font-size: 17px;
    font-weight: 700;
    color: #e1e4e8;
    margin: 0;
`;

const CloseBtn = styled.button`
    background: rgba(255, 255, 255, 0.04);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    color: #e1e4e8;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.1); }
`;

const FormBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 24px 26px;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: #4a5568;
    text-align: center;

    span { font-size: 48px; }
    p { font-size: 14px; margin: 0; }
`;

const TypeDescription = styled.p`
    font-size: 13px;
    color: #4a5568;
    margin: 0 0 24px;
    line-height: 1.5;
`;

const NameFieldGroup = styled.div`
    margin-bottom: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
`;

const FieldGroup = styled.div`
    margin-bottom: 18px;
`;

const Label = styled.label`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #6b7a8d;
    margin-bottom: 6px;
`;

const Hint = styled.span`
    font-size: 11px;
    color: #4a5568;
    font-weight: 400;
    margin-left: 6px;
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: #e1e4e8;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;

    &::placeholder { color: #8899a6; }
    &:focus { border-color: #0C5CAB; }
`;

const Textarea = styled.textarea`
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: #e1e4e8;
    font-size: 13px;
    font-family: monospace;
    outline: none;
    box-sizing: border-box;
    resize: vertical;
    min-height: 80px;
    transition: border-color 0.15s;

    &::placeholder { color: #8899a6; }
    &:focus { border-color: #0C5CAB; }
`;

const Select = styled.select`
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: #e1e4e8;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
    cursor: pointer;
    appearance: none;

    &:focus { border-color: #0C5CAB; }

    option {
        background: rgba(255, 255, 255, 0.03);
        color: #e1e4e8;
    }
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
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: #6b7a8d;
    transition: all 0.15s;

    &:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.1);
    }

    input[type="checkbox"] {
        accent-color: #0C5CAB;
        width: 16px;
        height: 16px;
        cursor: pointer;
    }
`;

const ErrorMsg = styled.p`
    font-size: 13px;
    color: #f87171;
    margin: 0 0 16px;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.1);
    border-radius: 8px;
    border: 1px solid rgba(248, 113, 113, 0.2);
`;

const Footer = styled.div`
    padding: 18px 26px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
`;

const CancelBtn = styled.button`
    padding: 10px 20px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #6b7a8d;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.04); color: #e1e4e8; }
`;

const SubmitBtn = styled.button`
    padding: 10px 24px;
    background: #0C5CAB;
    border: none;
    border-radius: 8px;
    color: #ffffff;
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

const Spinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-top-color: #e1e4e8;
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

const LoadingOverlay = styled.div`
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    z-index: 10;
`;

const BigSpinner = styled.div`
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: #0C5CAB;
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

// ── Component ─────────────────────────────────────────────────────────────────

const CreateGuardrailModal: React.FC<Props> = ({ isOpen, onClose, onCreated, appToEdit, defaultApiKey }) => {
    const isEditMode = !!appToEdit;
    const [selectedType, setSelectedType] = useState<AppType | null>(null);
    const [guardrailName, setGuardrailName] = useState('');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        if (appToEdit) {
            setSelectedType(appToEdit.type as AppType);
            setGuardrailName(appToEdit.name ?? '');
            const cfg = (appToEdit.config ?? {}) as Record<string, unknown>;
            const strCfg: Record<string, string> = {};
            for (const k in cfg) {
                const v = cfg[k];
                if (v !== null && v !== undefined) {
                    strCfg[k] = typeof v === 'string' ? v : String(v);
                }
            }
            setFormValues(strCfg);
        } else {
            setSelectedType(null);
            setGuardrailName('');
            setFormValues(defaultApiKey ? { api_key: defaultApiKey } : {});
        }
        setErrorMessage(null);
    }, [isOpen, appToEdit]);

    if (!isOpen) return null;

    const guardrailType = GUARDRAIL_TYPES.find(t => t.id === selectedType);

    const handleSelectType = (id: AppType) => {
        setSelectedType(id);
        if (!isEditMode) {
            const apiKey = formValues.api_key || defaultApiKey || '';
            setFormValues(apiKey ? { api_key: apiKey } : {});
        }
        setErrorMessage(null);
    };

    const handleChange = (key: string, value: string) => {
        setFormValues(prev => ({ ...prev, [key]: value }));
    };

    const isSupported = guardrailType && !guardrailType.comingSoon && isSupportedGuardrailType(guardrailType.id);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!guardrailType || !isSupported) return;

        const validationErrors = validateGuardrailForm(guardrailType.id, formValues);
        if (validationErrors.length > 0) {
            setErrorMessage(validationErrors.map(e => e.message).join('. '));
            return;
        }

        setIsLoading(true);
        setErrorMessage(null);
        try {
            const name = guardrailName.trim() || guardrailType.label;
            if (isEditMode && appToEdit?.id) {
                await updateApplication(appToEdit.id, {
                    name,
                    type: guardrailType.id,
                    category: 'Guardrails',
                    config: formValues,
                });
            } else {
                await createApplication({
                    name,
                    type: guardrailType.id,
                    category: 'Guardrails',
                    config: formValues,
                });
            }
            await onCreated();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to save guardrail';
            setErrorMessage(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <Modal>
                {isLoading && <LoadingOverlay><BigSpinner /></LoadingOverlay>}

                <Sidebar>
                    {GROUPS.map(group => {
                        const types = GUARDRAIL_TYPES.filter(t => t.group === group);
                        return (
                            <React.Fragment key={group}>
                                <GroupLabel>{group}</GroupLabel>
                                {types.map(t => (
                                    <TypeBtn
                                        key={t.id}
                                        type="button"
                                        $selected={selectedType === t.id}
                                        $disabled={!!t.comingSoon}
                                        onClick={(e) => { e.stopPropagation(); if (!t.comingSoon) handleSelectType(t.id); }}
                                    >
                                        <TypeIcon aria-hidden><t.icon size={15} /></TypeIcon>
                                        {t.label}
                                        {t.comingSoon && <ComingSoonBadge>Soon</ComingSoonBadge>}
                                    </TypeBtn>
                                ))}
                            </React.Fragment>
                        );
                    })}
                </Sidebar>

                <RightPanel>
                    <PanelHeader>
                        <PanelTitle>
                            {isEditMode
                                ? `Edit ${guardrailType?.label ?? 'Guardrail'}`
                                : guardrailType
                                    ? `Add ${guardrailType.label}`
                                    : 'Add Guardrail'}
                        </PanelTitle>
                        <CloseBtn type="button" onClick={onClose}>×</CloseBtn>
                    </PanelHeader>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        <FormBody>
                            {!guardrailType ? (
                                <EmptyState>
                                    <span>🛡️</span>
                                    <p>Select a guardrail type from the left<br />to configure your rule</p>
                                </EmptyState>
                            ) : (
                                <>
                                    {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                                    <TypeDescription>{guardrailType.description}</TypeDescription>

                                    <NameFieldGroup>
                                        <Label htmlFor="guardrail-name">Guardrail Name</Label>
                                        <Input
                                            id="guardrail-name"
                                            type="text"
                                            placeholder={guardrailType.label}
                                            value={guardrailName}
                                            onChange={e => setGuardrailName(e.target.value)}
                                        />
                                    </NameFieldGroup>

                                    {guardrailType.fields.map(field => (
                                        <FieldGroup key={field.key}>
                                            <Label htmlFor={field.key}>
                                                {field.label}
                                                {field.required && <span style={{ color: '#f87171' }}> *</span>}
                                                {field.hint && <Hint>({field.hint})</Hint>}
                                            </Label>
                                            {field.type === 'textarea' ? (
                                                <Textarea
                                                    id={field.key}
                                                    placeholder={field.placeholder}
                                                    value={formValues[field.key] ?? ''}
                                                    onChange={e => handleChange(field.key, e.target.value)}
                                                    rows={4}
                                                />
                                            ) : field.type === 'select' ? (
                                                <Select
                                                    id={field.key}
                                                    value={formValues[field.key] ?? ''}
                                                    onChange={e => handleChange(field.key, e.target.value)}
                                                >
                                                    <option value="">Select {field.label.toLowerCase()}…</option>
                                                    {(field.options ?? []).map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </Select>
                                            ) : field.type === 'multicheck' ? (
                                                <CheckboxGrid>
                                                    {(field.options ?? []).map(opt => {
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
                                                    type={field.type}
                                                    placeholder={field.placeholder}
                                                    value={formValues[field.key] ?? ''}
                                                    onChange={e => handleChange(field.key, e.target.value)}
                                                    step={field.type === 'number' ? '0.01' : undefined}
                                                    min={field.type === 'number' ? '0' : undefined}
                                                    max={field.type === 'number' ? '1' : undefined}
                                                />
                                            )}
                                        </FieldGroup>
                                    ))}
                                </>
                            )}
                        </FormBody>

                        <Footer>
                            <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                            <SubmitBtn type="submit" disabled={!isSupported || isLoading}>
                                {isLoading && <Spinner />}
                                {isEditMode ? 'Save Changes' : 'Add Guardrail'}
                            </SubmitBtn>
                        </Footer>
                    </form>
                </RightPanel>
            </Modal>
        </Overlay>
    );
};

export default CreateGuardrailModal;
