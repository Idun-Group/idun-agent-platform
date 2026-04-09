import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { Eye, EyeOff } from 'lucide-react';
import { createApplication, updateApplication, checkObservabilityConnection, mapConfigToApi, mapTypeToProvider } from '../../../services/applications';
import type { AppType, ApplicationConfig } from '../../../types/application.types';
import CheckConnectionButton from '../check-connection-button/component';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    appToEdit?: ApplicationConfig | null;
}

interface Provider {
    id: AppType;
    label: string;
    logo: string;
    fields: Field[];
}

interface Field {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    placeholder?: string;
    required?: boolean;
}

// Keys match what mapConfigFromApi returns (camelCase) so pre-fill works on edit.
// mapConfigToApi also accepts these keys for both create and update.
const PROVIDERS: Provider[] = [
    {
        id: 'Langfuse',
        label: 'Langfuse',
        logo: '/img/langfuse-logo.png',
        fields: [
            { key: 'host', label: 'Host URL', type: 'url', placeholder: 'https://cloud.langfuse.com', required: true },
            { key: 'publicKey', label: 'Public Key', type: 'text', placeholder: 'pk-lf-...', required: true },
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'sk-lf-...', required: true },
        ],
    },
    {
        id: 'Phoenix',
        label: 'Phoenix',
        logo: '/img/phoenix-logo.png',
        fields: [
            { key: 'host', label: 'Host URL', type: 'url', placeholder: 'http://localhost:6006', required: true },
            { key: 'projectName', label: 'Project Name', type: 'text', placeholder: 'my-project' },
        ],
    },
    {
        id: 'LangSmith',
        label: 'LangSmith',
        logo: '/img/langsmith-logo.png',
        fields: [
            { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'ls__...', required: true },
            { key: 'projectName', label: 'Project Name', type: 'text', placeholder: 'my-project' },
            { key: 'endpoint', label: 'Endpoint', type: 'text', placeholder: 'https://api.smith.langchain.com' },
        ],
    },
    {
        id: 'GoogleCloudLogging',
        label: 'GCP Logging',
        logo: '/img/google-cloud-logo.png',
        fields: [
            { key: 'gcpProjectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-gcp-project', required: true },
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-central1' },
        ],
    },
    {
        id: 'GoogleCloudTrace',
        label: 'GCP Trace',
        logo: '/img/google-cloud-logo.png',
        fields: [
            { key: 'gcpProjectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-gcp-project', required: true },
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-central1' },
        ],
    },
];

const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

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
    width: 820px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
    position: relative;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const Sidebar = styled.div`
    width: 220px;
    flex-shrink: 0;
    background: rgba(12, 92, 171, 0.1);
    border-right: 1px solid rgba(255, 255, 255, 0.04);
    padding: 24px 12px;
    overflow-y: auto;
`;

const SidebarTitle = styled.p`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #4a5568;
    margin: 0 0 12px 8px;
`;

const ProviderBtn = styled.button<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid ${p => p.$selected ? '#0C5CAB' : 'transparent'};
    background: ${p => p.$selected ? 'rgba(12, 92, 171, 0.15)' : 'transparent'};
    color: ${p => p.$selected ? '#0C5CAB' : '#6b7a8d'};
    font-size: 14px;
    font-weight: ${p => p.$selected ? 600 : 400};
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    margin-bottom: 4px;

    &:hover {
        background: rgba(255, 255, 255, 0.04);
        color: #e1e4e8;
    }
`;

const ProviderLogo = styled.span`
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
        width: 20px;
        height: 20px;
        object-fit: contain;
    }
`;

const RightPanel = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const PanelHeader = styled.div`
    padding: 24px 28px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const PanelTitle = styled.h2`
    font-size: 18px;
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
    padding: 28px;
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

const NameFieldGroup = styled.div`
    margin-bottom: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
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
    padding: 20px 28px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
`;

const FooterRight = styled.div`
    display: flex;
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

const CreateObservabilityModal: React.FC<Props> = ({ isOpen, onClose, onCreated, appToEdit }) => {
    const isEditMode = !!appToEdit;
    const [selectedProvider, setSelectedProvider] = useState<AppType | null>(null);
    const [integrationName, setIntegrationName] = useState('');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!isOpen) return;
        if (appToEdit) {
            setSelectedProvider(appToEdit.type as AppType);
            setIntegrationName(appToEdit.name ?? '');
            const cfg = appToEdit.config as Record<string, unknown> ?? {};
            const strCfg: Record<string, string> = {};
            for (const k in cfg) {
                const v = cfg[k];
                if (v !== null && v !== undefined) {
                    strCfg[k] = typeof v === 'string' ? v : JSON.stringify(v);
                }
            }
            setFormValues(strCfg);
        } else {
            setSelectedProvider(null);
            setIntegrationName('');
            setFormValues({});
        }
        setErrorMessage(null);
        setVisiblePasswords({});
    }, [isOpen, appToEdit]);

    if (!isOpen) return null;

    const provider = PROVIDERS.find(p => p.id === selectedProvider);

    const handleSelectProvider = (id: AppType) => {
        setSelectedProvider(id);
        if (!isEditMode) setFormValues({});
        setErrorMessage(null);
    };

    const handleChange = (key: string, value: string) => {
        setFormValues(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!provider) return;

        const missing = provider.fields.filter(f => f.required && !formValues[f.key]?.trim());
        if (missing.length > 0) {
            setErrorMessage(`Required: ${missing.map(f => f.label).join(', ')}`);
            return;
        }

        setIsLoading(true);
        setErrorMessage(null);
        try {
            const name = integrationName.trim() || `${provider.label} Integration`;
            if (isEditMode && appToEdit?.id) {
                await updateApplication(appToEdit.id, {
                    name,
                    type: provider.id,
                    category: 'Observability',
                    config: formValues,
                });
            } else {
                await createApplication({
                    name,
                    type: provider.id,
                    category: 'Observability',
                    config: formValues,
                });
            }
            onCreated();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to save integration';
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
                    <SidebarTitle>Providers</SidebarTitle>
                    {PROVIDERS.map(p => {
                        const isSel = selectedProvider === p.id;
                        return (
                            <ProviderBtn
                                key={p.id}
                                type="button"
                                $selected={isSel}
                                onClick={(e) => { e.stopPropagation(); handleSelectProvider(p.id); }}
                            >
                                <ProviderLogo><img src={p.logo} alt={p.label} /></ProviderLogo>
                                {p.label}
                            </ProviderBtn>
                        );
                    })}
                </Sidebar>

                <RightPanel>
                    <PanelHeader>
                        <PanelTitle>
                            {isEditMode
                                ? `Edit ${provider?.label ?? 'Integration'}`
                                : provider
                                    ? `Connect ${provider.label}`
                                    : 'Add Observability Integration'}
                        </PanelTitle>
                        <CloseBtn type="button" onClick={onClose}>×</CloseBtn>
                    </PanelHeader>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        <FormBody>
                            {!provider ? (
                                <EmptyState>
                                    <img src="/img/langfuse-logo.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain', opacity: 0.3 }} />
                                    <p>Select a provider from the left<br />to configure your integration</p>
                                </EmptyState>
                            ) : (
                                <>
                                    {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                                    <NameFieldGroup>
                                        <Label htmlFor="integration-name">Integration Name</Label>
                                        <Input
                                            id="integration-name"
                                            type="text"
                                            placeholder={`${provider.label} Integration`}
                                            value={integrationName}
                                            onChange={e => setIntegrationName(e.target.value)}
                                        />
                                    </NameFieldGroup>

                                    {provider.fields.map(field => (
                                        <FieldGroup key={field.key}>
                                            <Label htmlFor={field.key}>
                                                {field.label}{field.required && <span style={{ color: '#f87171' }}> *</span>}
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
                                                    <PasswordToggleBtn
                                                        type="button"
                                                        onClick={() => setVisiblePasswords(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                                                    >
                                                        {visiblePasswords[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </PasswordToggleBtn>
                                                </PasswordWrapper>
                                            ) : (
                                                <Input
                                                    id={field.key}
                                                    type={field.type}
                                                    placeholder={field.placeholder}
                                                    value={formValues[field.key] ?? ''}
                                                    onChange={e => handleChange(field.key, e.target.value)}
                                                />
                                            )}
                                        </FieldGroup>
                                    ))}
                                </>
                            )}
                        </FormBody>

                        <Footer>
                            {provider && (
                                <CheckConnectionButton
                                    disabled={!provider || isLoading}
                                    onCheck={() => checkObservabilityConnection({
                                        provider: mapTypeToProvider(provider.id),
                                        enabled: true,
                                        config: mapConfigToApi(provider.id, formValues),
                                    })}
                                />
                            )}
                            <FooterRight>
                                <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                                <SubmitBtn type="submit" disabled={!provider || isLoading}>
                                    {isLoading && <Spinner />}
                                    {isEditMode ? 'Save Changes' : 'Connect'}
                                </SubmitBtn>
                            </FooterRight>
                        </Footer>
                    </form>
                </RightPanel>
            </Modal>
        </Overlay>
    );
};

export default CreateObservabilityModal;
