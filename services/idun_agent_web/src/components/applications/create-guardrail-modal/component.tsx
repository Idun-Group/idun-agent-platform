import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { createApplication, updateApplication } from '../../../services/applications';
import type { AppType, ApplicationConfig } from '../../../types/application.types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    appToEdit?: ApplicationConfig | null;
}

type FieldType = 'text' | 'password' | 'number' | 'textarea';

interface Field {
    key: string;
    label: string;
    type: FieldType;
    placeholder?: string;
    required?: boolean;
    hint?: string;
}

interface GuardrailType {
    id: AppType;
    label: string;
    icon: string;
    group: string;
    description: string;
    fields: Field[];
}

const GUARDRAIL_TYPES: GuardrailType[] = [
    // Enterprise
    {
        id: 'ModelArmor',
        label: 'Model Armor',
        icon: '🛡️',
        group: 'Enterprise',
        description: 'Google Cloud Model Armor for enterprise-grade content filtering',
        fields: [
            { key: 'projectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-project-id', required: true },
            { key: 'location', label: 'Location', type: 'text', placeholder: 'us-central1', required: true },
            { key: 'templateId', label: 'Template ID', type: 'text', placeholder: 'my-template', required: true },
        ],
    },
    {
        id: 'CustomLLM',
        label: 'Custom LLM',
        icon: '🤖',
        group: 'Enterprise',
        description: 'Use a custom LLM as a guardrail to evaluate responses',
        fields: [
            { key: 'model', label: 'Model', type: 'text', placeholder: 'gemini-2.0-flash', required: true },
            { key: 'prompt', label: 'System Prompt', type: 'textarea', placeholder: 'You are a content moderator. Respond with SAFE or UNSAFE only.', required: true },
        ],
    },
    // Content Safety
    {
        id: 'BanList',
        label: 'Ban List',
        icon: '🚫',
        group: 'Content Safety',
        description: 'Block specific words or phrases from appearing in responses',
        fields: [
            { key: 'banned_words', label: 'Banned Words / Phrases', type: 'textarea', placeholder: 'word1\nword2\nphrase to ban', hint: 'One word or phrase per line' },
        ],
    },
    {
        id: 'NSFWText',
        label: 'NSFW Text',
        icon: '🔞',
        group: 'Content Safety',
        description: 'Detect and filter adult or inappropriate content',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
    },
    {
        id: 'ToxicLanguage',
        label: 'Toxic Language',
        icon: '☠️',
        group: 'Content Safety',
        description: 'Filter hate speech, threats, and toxic content',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
    },
    {
        id: 'GibberishText',
        label: 'Gibberish Text',
        icon: '🔤',
        group: 'Content Safety',
        description: 'Detect random, meaningless or garbled text',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
    },
    {
        id: 'CodeScanner',
        label: 'Code Scanner',
        icon: '💻',
        group: 'Content Safety',
        description: 'Restrict code generation to allowed programming languages',
        fields: [
            { key: 'allowed_languages', label: 'Allowed Languages', type: 'textarea', placeholder: 'python\njavascript\ntypescript', hint: 'One language per line' },
        ],
    },
    // Identity & Security
    {
        id: 'DetectPII',
        label: 'Detect PII',
        icon: '🔒',
        group: 'Identity & Security',
        description: 'Detect and mask Personally Identifiable Information',
        fields: [
            { key: 'pii_entities', label: 'PII Entities to Detect', type: 'textarea', placeholder: 'PERSON,EMAIL_ADDRESS,PHONE_NUMBER', hint: 'Comma-separated entity types' },
        ],
    },
    {
        id: 'DetectJailbreak',
        label: 'Detect Jailbreak',
        icon: '⛓️',
        group: 'Identity & Security',
        description: 'Detect prompt injection and jailbreak attempts',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
    },
    {
        id: 'PromptInjection',
        label: 'Prompt Injection',
        icon: '💉',
        group: 'Identity & Security',
        description: 'Prevent prompt injection attacks',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
    },
    // Context & Quality
    {
        id: 'BiasCheck',
        label: 'Bias Check',
        icon: '⚖️',
        group: 'Context & Quality',
        description: 'Detect and filter biased content in responses',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
    },
    {
        id: 'CompetitionCheck',
        label: 'Competition Check',
        icon: '🏆',
        group: 'Context & Quality',
        description: 'Prevent mention of competitor brands or products',
        fields: [
            { key: 'competitors', label: 'Competitor Names', type: 'textarea', placeholder: 'CompetitorA\nCompetitorB', hint: 'One name per line' },
        ],
    },
    {
        id: 'CorrectLanguage',
        label: 'Correct Language',
        icon: '🌐',
        group: 'Context & Quality',
        description: 'Enforce responses in specific languages only',
        fields: [
            { key: 'expected_languages', label: 'Expected Languages', type: 'textarea', placeholder: 'en\nfr\nde', hint: 'One language code per line' },
        ],
    },
    {
        id: 'RestrictTopic',
        label: 'Restrict Topic',
        icon: '🎯',
        group: 'Context & Quality',
        description: 'Limit conversations to specific allowed topics',
        fields: [
            { key: 'valid_topics', label: 'Allowed Topics', type: 'textarea', placeholder: 'customer support\nproduct information\ntechnical help', hint: 'One topic per line' },
        ],
    },
    {
        id: 'RagHallucination',
        label: 'RAG Hallucination',
        icon: '🧠',
        group: 'Context & Quality',
        description: 'Detect hallucinations in RAG-based responses',
        fields: [
            { key: 'threshold', label: 'Sensitivity Threshold (0–1)', type: 'number', placeholder: '0.5', hint: 'Lower = more sensitive' },
        ],
    },
];

const GROUPS = ['Enterprise', 'Content Safety', 'Identity & Security', 'Context & Quality'];

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
    background: var(--color-surface, #1a1a2e);
    border-radius: 16px;
    width: 860px;
    max-width: 96vw;
    max-height: 88vh;
    display: flex;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
`;

const Sidebar = styled.div`
    width: 240px;
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.25);
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    padding: 20px 10px;
    overflow-y: auto;
`;

const GroupLabel = styled.p`
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-text-muted, #666);
    margin: 16px 0 6px 10px;

    &:first-child { margin-top: 0; }
`;

const TypeBtn = styled.button<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid ${p => p.$selected ? 'var(--color-primary, #6c63ff)' : 'transparent'};
    background: ${p => p.$selected ? 'rgba(108, 99, 255, 0.15)' : 'transparent'};
    color: ${p => p.$selected ? 'var(--color-primary, #6c63ff)' : 'var(--color-text-secondary, #ccc)'};
    font-size: 13px;
    font-weight: ${p => p.$selected ? 600 : 400};
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    margin-bottom: 2px;

    &:hover {
        background: rgba(255, 255, 255, 0.06);
        color: white;
    }
`;

const TypeIcon = styled.span`
    font-size: 15px;
    line-height: 1;
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
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const PanelTitle = styled.h2`
    font-size: 17px;
    font-weight: 700;
    color: white;
    margin: 0;
`;

const CloseBtn = styled.button`
    background: rgba(255, 255, 255, 0.08);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    color: white;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.15); }
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
    color: var(--color-text-muted, #888);
    text-align: center;

    span { font-size: 48px; }
    p { font-size: 14px; margin: 0; }
`;

const TypeDescription = styled.p`
    font-size: 13px;
    color: var(--color-text-muted, #888);
    margin: 0 0 24px;
    line-height: 1.5;
`;

const NameFieldGroup = styled.div`
    margin-bottom: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
`;

const FieldGroup = styled.div`
    margin-bottom: 18px;
`;

const Label = styled.label`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary, #ccc);
    margin-bottom: 6px;
`;

const Hint = styled.span`
    font-size: 11px;
    color: var(--color-text-muted, #888);
    font-weight: 400;
    margin-left: 6px;
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;

    &::placeholder { color: rgba(255, 255, 255, 0.3); }
    &:focus { border-color: var(--color-primary, #6c63ff); }
`;

const Textarea = styled.textarea`
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 13px;
    font-family: monospace;
    outline: none;
    box-sizing: border-box;
    resize: vertical;
    min-height: 80px;
    transition: border-color 0.15s;

    &::placeholder { color: rgba(255, 255, 255, 0.3); }
    &:focus { border-color: var(--color-primary, #6c63ff); }
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
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
`;

const CancelBtn = styled.button`
    padding: 10px 20px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: var(--color-text-secondary, #ccc);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.06); color: white; }
`;

const SubmitBtn = styled.button`
    padding: 10px 24px;
    background: var(--color-primary, #6c63ff);
    border: none;
    border-radius: 8px;
    color: white;
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
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

const LoadingOverlay = styled.div`
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    z-index: 10;
`;

const BigSpinner = styled.div`
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--color-primary, #6c63ff);
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

// ── Component ─────────────────────────────────────────────────────────────────

const CreateGuardrailModal: React.FC<Props> = ({ isOpen, onClose, onCreated, appToEdit }) => {
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
            setFormValues({});
        }
        setErrorMessage(null);
    }, [isOpen, appToEdit]);

    if (!isOpen) return null;

    const guardrailType = GUARDRAIL_TYPES.find(t => t.id === selectedType);

    const handleSelectType = (id: AppType) => {
        setSelectedType(id);
        if (!isEditMode) setFormValues({});
        setErrorMessage(null);
    };

    const handleChange = (key: string, value: string) => {
        setFormValues(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!guardrailType) return;

        const missing = guardrailType.fields.filter(f => f.required && !formValues[f.key]?.trim());
        if (missing.length > 0) {
            setErrorMessage(`Required: ${missing.map(f => f.label).join(', ')}`);
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
            onCreated();
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
                                        onClick={(e) => { e.stopPropagation(); handleSelectType(t.id); }}
                                    >
                                        <TypeIcon>{t.icon}</TypeIcon>
                                        {t.label}
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
                            <SubmitBtn type="submit" disabled={!guardrailType || isLoading}>
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
