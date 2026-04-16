import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    GitPullRequest,
    X,
    Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchApplications, deleteApplication, createApplication, updateApplication } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';
import type { AppType } from '../../types/application.types';
import {
    PII_ENTITY_VALUES,
    validateGuardrailForm,
    isSupportedGuardrailType,
} from '../../services/guardrail-payloads';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';

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
    font-family: 'IBM Plex Sans', sans-serif;
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

// ── Header buttons ───────────────────────────────────────────────────────────

const HeaderBtn = styled.a`
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

const ApiKeyBtn = styled.button`
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
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
        color: #e1e4e8;
        border-color: rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.08);
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

// ── API Key Dropdown ─────────────────────────────────────────────────────────

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
    width: 160px;
    &::placeholder { color: #8899a6; }
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
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
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
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: #e1e4e8;
    font-size: 13px;
    font-family: monospace;
    outline: none;
    transition: border-color 0.15s;

    &::placeholder { color: #8899a6; }
    &:focus { border-color: #0C5CAB; }
`;

const DropdownVisBtn = styled.button`
    background: transparent;
    border: none;
    color: #8899a6;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;

    &:hover { color: #e1e4e8; }
`;

const DropdownSaveBtn = styled.button<{ $saved?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: ${p => p.$saved ? 'rgba(12, 92, 171, 0.15)' : '#0C5CAB'};
    border: ${p => p.$saved ? '1px solid rgba(12, 92, 171, 0.3)' : 'none'};
    border-radius: 8px;
    color: ${p => p.$saved ? '#0C5CAB' : '#ffffff'};
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
    color: #0C5CAB;
    text-decoration: none;
    white-space: nowrap;

    &:hover { text-decoration: underline; }
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
    border-right: 1px solid rgba(255, 255, 255, 0.04);
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
    color: #4a5568;
    margin: 20px 0 8px 10px;

    &:first-child { margin-top: 0; }
`;

const TypeBtn = styled.button<{ $disabled?: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: ${p => p.$disabled ? '#8899a6' : '#6b7a8d'};
    font-size: 13px;
    font-weight: 400;
    cursor: ${p => p.$disabled ? 'default' : 'pointer'};
    opacity: ${p => p.$disabled ? 0.5 : 1};
    transition: all 0.15s ease;
    text-align: left;
    margin-bottom: 2px;

    &:hover {
        background: ${p => p.$disabled ? 'transparent' : 'rgba(255, 255, 255, 0.04)'};
        color: ${p => p.$disabled ? '#8899a6' : '#e1e4e8'};
    }
`;

const TypeIconBox = styled.span`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: rgba(12, 92, 171, 0.08);
    color: #0C5CAB;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const AddIndicator = styled.span`
    margin-left: auto;
    font-size: 16px;
    color: #8899a6;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;

    ${TypeBtn}:hover & {
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
    background: rgba(255, 255, 255, 0.04);
    color: #8899a6;
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
    border: 1px dashed rgba(255, 255, 255, 0.06);
    background: transparent;
    color: #8899a6;
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    margin-top: 16px;

    &:hover {
        border-color: rgba(12, 92, 171, 0.4);
        color: #e1e4e8;
        background: rgba(12, 92, 171, 0.04);
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
    color: #e1e4e8;
    margin: 0;
`;

const EmptyDescription = styled.p`
    font-size: 13px;
    line-height: 1.7;
    color: #6b7a8d;
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
    background: rgba(20, 26, 38, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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

const CardInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const CardIcon = styled.div`
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(12, 92, 171, 0.12);
    color: #0C5CAB;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const CardMeta = styled.div``;

const CardName = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0 0 2px;
`;

const CardType = styled.p`
    font-size: 11px;
    color: #8899a6;
    margin: 0;
`;

const GroupBadge = styled.span`
    font-size: 10px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 20px;
    background: rgba(12, 92, 171, 0.1);
    color: #0C5CAB;
    border: 1px solid rgba(12, 92, 171, 0.2);
    white-space: nowrap;
`;

const CardDesc = styled.p`
    font-size: 12px;
    color: #6b7a8d;
    margin: 0;
    line-height: 1.4;
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
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
    color: #8899a6;
    text-transform: capitalize;
    flex-shrink: 0;
`;

const ConfigValue = styled.span`
    font-size: 12px;
    color: #6b7a8d;
    font-family: monospace;
    word-break: break-all;
    max-width: 160px;
    text-align: right;
`;

const AgentCountBadge = styled.span`
    font-size: 11px;
    color: #8899a6;
`;

const CardActions = styled.div`
    display: flex;
    gap: 8px;
    margin-top: auto;
`;

const EditBtn = styled.button`
    flex: 1;
    padding: 7px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: #e1e4e8;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.08); }
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

// ── Per-guardrail modal styled components ────────────────────────────────────

const modalIn = keyframes`from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); }`;

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
    width: 520px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
    animation: ${modalIn} 0.2s ease;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const ModalHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 24px 28px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
`;

const ModalIconBox = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(12, 92, 171, 0.12);
    color: #0C5CAB;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ModalTitleBlock = styled.div`
    flex: 1;
`;

const ModalTitle = styled.h2`
    font-size: 17px;
    font-weight: 700;
    color: #e1e4e8;
    margin: 0;
`;

const ModalSubtitle = styled.p`
    font-size: 12px;
    color: #8899a6;
    margin: 2px 0 0;
`;

const CloseBtn = styled.button`
    background: rgba(255, 255, 255, 0.04);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    color: #8899a6;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;

    &:hover { background: rgba(255, 255, 255, 0.1); color: #e1e4e8; }
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
    color: #6b7a8d;
    margin-bottom: 8px;
`;

const Required = styled.span`
    color: #f87171;
`;

const Hint = styled.p`
    font-size: 11px;
    color: #8899a6;
    margin: 4px 0 0;
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
    transition: border-color 0.15s, box-shadow 0.15s;

    &::placeholder { color: #8899a6; }
    &:focus { border-color: #0C5CAB; box-shadow: 0 0 0 2px rgba(12, 92, 171, 0.12); }
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
    transition: border-color 0.15s, box-shadow 0.15s;

    &::placeholder { color: #8899a6; }
    &:focus { border-color: #0C5CAB; box-shadow: 0 0 0 2px rgba(12, 92, 171, 0.12); }
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
    color: #8899a6;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    flex-shrink: 0;

    &:hover { color: #e1e4e8; }
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
        border-color: rgba(12, 92, 171, 0.3);
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

const ModalFooter = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 28px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
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

const SmallSpinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-top-color: #e1e4e8;
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

// ── Per-guardrail modal component ────────────────────────────────────────────

interface GuardrailModalProps {
    typeId: string;
    appToEdit: ApplicationConfig | null;
    defaultApiKey: string;
    onClose: () => void;
    onSaved: () => void;
}

const GuardrailModal: React.FC<GuardrailModalProps> = ({ typeId, appToEdit, defaultApiKey, onClose, onSaved }) => {
    const meta = TYPE_META[typeId];
    const fields = GUARDRAIL_FIELDS[typeId] ?? [];
    const label = GUARDRAIL_LABELS[typeId] ?? typeId;
    const isEditMode = !!appToEdit;
    const Icon = meta?.icon ?? Shield;

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

    return (
        <Overlay onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <Modal>
                <ModalHeader>
                    <ModalIconBox><Icon size={20} /></ModalIconBox>
                    <ModalTitleBlock>
                        <ModalTitle>{isEditMode ? `Edit ${label}` : label}</ModalTitle>
                        <ModalSubtitle>{meta?.description ?? ''}</ModalSubtitle>
                    </ModalTitleBlock>
                    <CloseBtn type="button" onClick={onClose}><X size={16} /></CloseBtn>
                </ModalHeader>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <ModalBody>
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
                    </ModalBody>

                    <ModalFooter>
                        <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                        <SubmitBtn type="submit" disabled={isSubmitting}>
                            {isSubmitting && <SmallSpinner />}
                            {isEditMode ? 'Save Changes' : `Add ${label}`}
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
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // API key dropdown
    const [globalApiKey, setGlobalApiKey] = useState(() => localStorage.getItem(LOCALSTORAGE_KEY) ?? '');
    const [apiKeySaved, setApiKeySaved] = useState(() => !!localStorage.getItem(LOCALSTORAGE_KEY));
    const [showApiKey, setShowApiKey] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Modal
    const [modalTypeId, setModalTypeId] = useState<string | null>(null);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);

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

    const openCreate = (typeId: string) => { setAppToEdit(null); setModalTypeId(typeId); };
    const openEdit = (app: ApplicationConfig) => { setAppToEdit(app); setModalTypeId(app.type); };
    const closeModal = () => { setModalTypeId(null); setAppToEdit(null); };

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

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Guardrails</PageTitle>
                    <PageSubtitle>Enforce safety rules and content policies on your agents</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={14} style={{ color: '#8899a6', flexShrink: 0 }} />
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

            <MainLayout>
                {/* ── Left: Type picker ──────────────────────────── */}
                <TypeColumn>
                    {GROUPS.map(group => {
                        const types = Object.entries(TYPE_META).filter(([, m]) => m.group === group);
                        return (
                            <React.Fragment key={group}>
                                <GroupLabel>{group}</GroupLabel>
                                {types.map(([id, meta]) => (
                                    <TypeBtn
                                        key={id}
                                        type="button"
                                        $disabled={!!meta.comingSoon}
                                        onClick={() => { if (!meta.comingSoon) openCreate(id); }}
                                    >
                                        <TypeIconBox><meta.icon size={15} /></TypeIconBox>
                                        {id === 'BanList' ? 'Ban List' :
                                         id === 'NSFWText' ? 'NSFW Text' :
                                         id === 'ToxicLanguage' ? 'Toxic Language' :
                                         id === 'GibberishText' ? 'Gibberish Text' :
                                         id === 'CodeScanner' ? 'Code Scanner' :
                                         id === 'DetectPII' ? 'Detect PII' :
                                         id === 'DetectJailbreak' ? 'Detect Jailbreak' :
                                         id === 'PromptInjection' ? 'Prompt Injection' :
                                         id === 'ModelArmor' ? 'Model Armor' :
                                         id === 'CustomLLM' ? 'Custom LLM' :
                                         id === 'BiasCheck' ? 'Bias Check' :
                                         id === 'CompetitionCheck' ? 'Competition Check' :
                                         id === 'CorrectLanguage' ? 'Correct Language' :
                                         id === 'RestrictTopic' ? 'Restrict Topic' :
                                         id === 'RagHallucination' ? 'RAG Hallucination' :
                                         id}
                                        {meta.comingSoon ? <ComingSoonBadge>Soon</ComingSoonBadge> : <AddIndicator>+</AddIndicator>}
                                    </TypeBtn>
                                ))}
                            </React.Fragment>
                        );
                    })}

                    <RequestBtn
                        type="button"
                        onClick={() => window.open('https://github.com/Idun-Group/idun-agent-platform/issues/new?labels=enhancement&template=feature_request.md&title=%5BGuardrails%5D+New+guardrail+request', '_blank')}
                    >
                        <TypeIconBox><GitPullRequest size={15} /></TypeIconBox>
                        Request a guardrail
                    </RequestBtn>
                </TypeColumn>

                {/* ── Right: Configured guardrails ───────────────── */}
                <ContentColumn>
                    {isLoading ? (
                        <CenterBox>
                            <LoadingSpinner />
                            <p>Loading guardrails…</p>
                        </CenterBox>
                    ) : apps.length === 0 ? (
                        <EmptyState>
                            <EmptyTitle>Select a guardrail to get started</EmptyTitle>
                            <EmptyDescription>
                                15+ ready-to-use guardrails for AI governance. Block PII leaks with prompt injection protection, topic filtering, and custom guardrails tailored to your use case.
                            </EmptyDescription>
                            <EmptyChips>
                                <Chip $color="#ef4444">Content Safety</Chip>
                                <Chip $color="#f59e0b">Identity &amp; Security</Chip>
                                <Chip $color="#0C5CAB">Enterprise</Chip>
                                <Chip $color="#10b981">Context &amp; Quality</Chip>
                            </EmptyChips>
                            <EmptyImage src="/img/guardrails-flow.png" alt="" />
                        </EmptyState>
                    ) : (
                        <CardsGrid>
                            {apps.filter(a => {
                                if (!searchTerm) return true;
                                const term = searchTerm.toLowerCase();
                                return (a.name?.toLowerCase().includes(term) || a.type?.toLowerCase().includes(term));
                            }).map(app => {
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
                </ContentColumn>
            </MainLayout>

            {/* ── Per-guardrail modal ──────────────────────────── */}
            {modalTypeId && (
                <GuardrailModal
                    typeId={modalTypeId}
                    appToEdit={appToEdit}
                    defaultApiKey={globalApiKey.trim()}
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
                    ? `This guardrail is used by ${appToDelete!.agentCount} agent${appToDelete!.agentCount !== 1 ? 's' : ''}. Remove the guardrail from those agents first.`
                    : undefined}
            />
        </PageWrapper>
    );
};

export default GuardrailsPage;
