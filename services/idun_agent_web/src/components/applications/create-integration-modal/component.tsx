import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { createIntegration, updateIntegration } from '../../../services/integrations';
import type { ManagedIntegration, IntegrationProvider } from '../../../services/integrations';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    appToEdit?: ManagedIntegration | null;
    provider: IntegrationProvider;
}

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
    background: var(--color-surface, #1a1a2e);
    border-radius: 16px;
    width: 560px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
`;

const PanelHeader = styled.div`
    padding: 24px 28px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const PanelTitle = styled.h2`
    font-size: 18px;
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
    padding: 28px;
`;

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const Label = styled.label`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary, #ccc);
    margin-bottom: 8px;
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

const HelpText = styled.p`
    font-size: 12px;
    color: var(--color-text-muted, #888);
    margin: 6px 0 0;
`;

const ToggleRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
`;

const ToggleLabel = styled.span`
    font-size: 14px;
    font-weight: 500;
    color: white;
`;

const Toggle = styled.button<{ $active: boolean }>`
    width: 44px;
    height: 24px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
    background: ${p => p.$active ? '#25D366' : 'rgba(255, 255, 255, 0.15)'};

    &::after {
        content: '';
        position: absolute;
        top: 3px;
        left: ${p => p.$active ? '23px' : '3px'};
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: white;
        transition: left 0.2s;
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
    padding: 20px 28px;
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

const SubmitBtn = styled.button<{ $color?: string }>`
    padding: 10px 24px;
    background: ${p => p.$color ?? '#6c63ff'};
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

const BigSpinner = styled.div<{ $color?: string }>`
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: ${p => p.$color ?? '#6c63ff'};
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

const ProviderBanner = styled.div<{ $color: string }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: ${p => `${p.$color}14`};
    border: 1px solid ${p => `${p.$color}33`};
    border-radius: 10px;
    margin-bottom: 20px;
    color: ${p => p.$color};
    font-size: 14px;
    font-weight: 600;
`;

const PROVIDER_META: Record<IntegrationProvider, { label: string; color: string }> = {
    WHATSAPP: { label: 'WhatsApp Business Cloud API', color: '#25D366' },
    DISCORD: { label: 'Discord Interactions Endpoint', color: '#5865F2' },
};

const CreateIntegrationModal: React.FC<Props> = ({ isOpen, onClose, onCreated, appToEdit, provider }) => {
    const [name, setName] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // WhatsApp fields
    const [accessToken, setAccessToken] = useState('');
    const [phoneNumberId, setPhoneNumberId] = useState('');
    const [verifyToken, setVerifyToken] = useState('');
    const [apiVersion, setApiVersion] = useState('v21.0');

    // Discord fields
    const [botToken, setBotToken] = useState('');
    const [applicationId, setApplicationId] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [guildId, setGuildId] = useState('');

    useEffect(() => {
        if (isOpen && appToEdit) {
            setName(appToEdit.name);
            setEnabled(appToEdit.integration.enabled);
            setErrorMessage(null);

            const cfg = appToEdit.integration.config;
            if (appToEdit.integration.provider === 'WHATSAPP' && 'access_token' in cfg) {
                setAccessToken(cfg.access_token);
                setPhoneNumberId(cfg.phone_number_id);
                setVerifyToken(cfg.verify_token);
                setApiVersion(cfg.api_version ?? 'v21.0');
            } else if (appToEdit.integration.provider === 'DISCORD' && 'bot_token' in cfg) {
                setBotToken(cfg.bot_token);
                setApplicationId(cfg.application_id);
                setPublicKey(cfg.public_key);
                setGuildId(cfg.guild_id ?? '');
            }
        } else if (isOpen) {
            setName('');
            setEnabled(true);
            setErrorMessage(null);
            setAccessToken(''); setPhoneNumberId(''); setVerifyToken(''); setApiVersion('v21.0');
            setBotToken(''); setApplicationId(''); setPublicKey(''); setGuildId('');
        }
    }, [isOpen, appToEdit]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) { setErrorMessage('Name is required'); return; }

        let config;
        if (provider === 'WHATSAPP') {
            if (!accessToken.trim()) { setErrorMessage('Access Token is required'); return; }
            if (!phoneNumberId.trim()) { setErrorMessage('Phone Number ID is required'); return; }
            if (!verifyToken.trim()) { setErrorMessage('Verify Token is required'); return; }
            config = {
                access_token: accessToken.trim(),
                phone_number_id: phoneNumberId.trim(),
                verify_token: verifyToken.trim(),
                api_version: apiVersion.trim() || 'v21.0',
            };
        } else {
            if (!botToken.trim()) { setErrorMessage('Bot Token is required'); return; }
            if (!applicationId.trim()) { setErrorMessage('Application ID is required'); return; }
            if (!publicKey.trim()) { setErrorMessage('Public Key is required'); return; }
            config = {
                bot_token: botToken.trim(),
                application_id: applicationId.trim(),
                public_key: publicKey.trim(),
                ...(guildId.trim() ? { guild_id: guildId.trim() } : {}),
            };
        }

        setIsLoading(true);
        setErrorMessage(null);

        try {
            const integration = { provider, enabled, config };

            if (appToEdit?.id) {
                await updateIntegration(appToEdit.id, { name: name.trim(), integration });
            } else {
                await createIntegration({ name: name.trim(), integration });
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
                {isLoading && <LoadingOverlay><BigSpinner $color={PROVIDER_META[provider].color} /></LoadingOverlay>}

                <PanelHeader>
                    <PanelTitle>{appToEdit ? 'Edit Integration' : 'Add Integration'}</PanelTitle>
                    <CloseBtn type="button" onClick={onClose}>×</CloseBtn>
                </PanelHeader>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <FormBody>
                        {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                        <ProviderBanner $color={PROVIDER_META[provider].color}>
                            {PROVIDER_META[provider].label}
                        </ProviderBanner>

                        <FieldGroup>
                            <Label htmlFor="int-name">
                                Name <span style={{ color: '#f87171' }}>*</span>
                            </Label>
                            <Input
                                id="int-name"
                                type="text"
                                placeholder={`My ${PROVIDER_META[provider].label} Integration`}
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </FieldGroup>

                        {provider === 'WHATSAPP' && (
                            <>
                                <FieldGroup>
                                    <Label htmlFor="int-access-token">
                                        Access Token <span style={{ color: '#f87171' }}>*</span>
                                    </Label>
                                    <Input
                                        id="int-access-token"
                                        type="password"
                                        placeholder="EAAxxxxxxx..."
                                        value={accessToken}
                                        onChange={e => setAccessToken(e.target.value)}
                                    />
                                    <HelpText>Meta Graph API permanent access token</HelpText>
                                </FieldGroup>

                                <FieldGroup>
                                    <Label htmlFor="int-phone-id">
                                        Phone Number ID <span style={{ color: '#f87171' }}>*</span>
                                    </Label>
                                    <Input
                                        id="int-phone-id"
                                        type="text"
                                        placeholder="106540352242922"
                                        value={phoneNumberId}
                                        onChange={e => setPhoneNumberId(e.target.value)}
                                    />
                                    <HelpText>WhatsApp Business phone number ID from Meta dashboard</HelpText>
                                </FieldGroup>

                                <FieldGroup>
                                    <Label htmlFor="int-verify-token">
                                        Verify Token <span style={{ color: '#f87171' }}>*</span>
                                    </Label>
                                    <Input
                                        id="int-verify-token"
                                        type="password"
                                        placeholder="my-webhook-verify-secret"
                                        value={verifyToken}
                                        onChange={e => setVerifyToken(e.target.value)}
                                    />
                                    <HelpText>Webhook verification token — must match Meta webhook configuration</HelpText>
                                </FieldGroup>

                                <FieldGroup>
                                    <Label htmlFor="int-api-version">API Version</Label>
                                    <Input
                                        id="int-api-version"
                                        type="text"
                                        placeholder="v21.0"
                                        value={apiVersion}
                                        onChange={e => setApiVersion(e.target.value)}
                                    />
                                    <HelpText>Meta Graph API version (default: v21.0)</HelpText>
                                </FieldGroup>
                            </>
                        )}

                        {provider === 'DISCORD' && (
                            <>
                                <FieldGroup>
                                    <Label htmlFor="int-bot-token">
                                        Bot Token <span style={{ color: '#f87171' }}>*</span>
                                    </Label>
                                    <Input
                                        id="int-bot-token"
                                        type="password"
                                        placeholder="MTExxxxx..."
                                        value={botToken}
                                        onChange={e => setBotToken(e.target.value)}
                                    />
                                    <HelpText>Discord bot token from the Developer Portal</HelpText>
                                </FieldGroup>

                                <FieldGroup>
                                    <Label htmlFor="int-application-id">
                                        Application ID <span style={{ color: '#f87171' }}>*</span>
                                    </Label>
                                    <Input
                                        id="int-application-id"
                                        type="text"
                                        placeholder="1234567890123456789"
                                        value={applicationId}
                                        onChange={e => setApplicationId(e.target.value)}
                                    />
                                    <HelpText>Discord application ID from General Information</HelpText>
                                </FieldGroup>

                                <FieldGroup>
                                    <Label htmlFor="int-public-key">
                                        Public Key <span style={{ color: '#f87171' }}>*</span>
                                    </Label>
                                    <Input
                                        id="int-public-key"
                                        type="text"
                                        placeholder="Ed25519 public key hex string"
                                        value={publicKey}
                                        onChange={e => setPublicKey(e.target.value)}
                                    />
                                    <HelpText>Ed25519 public key for verifying interaction signatures</HelpText>
                                </FieldGroup>

                                <FieldGroup>
                                    <Label htmlFor="int-guild-id">Guild ID</Label>
                                    <Input
                                        id="int-guild-id"
                                        type="text"
                                        placeholder="Optional — restrict to a specific server"
                                        value={guildId}
                                        onChange={e => setGuildId(e.target.value)}
                                    />
                                    <HelpText>Leave empty to allow all servers</HelpText>
                                </FieldGroup>
                            </>
                        )}

                        <ToggleRow>
                            <ToggleLabel>Enabled</ToggleLabel>
                            <Toggle
                                type="button"
                                $active={enabled}
                                onClick={() => setEnabled(v => !v)}
                            />
                        </ToggleRow>
                    </FormBody>

                    <Footer>
                        <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                        <SubmitBtn type="submit" disabled={isLoading} $color={PROVIDER_META[provider].color}>
                            {isLoading && <Spinner />}
                            {appToEdit ? 'Save Changes' : 'Add Integration'}
                        </SubmitBtn>
                    </Footer>
                </form>
            </Modal>
        </Overlay>
    );
};

export default CreateIntegrationModal;
