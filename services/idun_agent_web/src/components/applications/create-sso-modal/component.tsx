import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { createSSO, updateSSO } from '../../../services/sso';
import type { ManagedSSO } from '../../../services/sso';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    appToEdit?: ManagedSSO | null;
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

const TextArea = styled.textarea`
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
    resize: vertical;
    min-height: 60px;
    font-family: monospace;

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
    background: ${p => p.$active ? 'var(--color-primary, #6c63ff)' : 'rgba(255, 255, 255, 0.15)'};

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

const CreateSsoModal: React.FC<Props> = ({ isOpen, onClose, onCreated, appToEdit }) => {
    const [name, setName] = useState('');
    const [issuer, setIssuer] = useState('');
    const [clientId, setClientId] = useState('');
    const [allowedDomains, setAllowedDomains] = useState('');
    const [allowedEmails, setAllowedEmails] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && appToEdit) {
            setName(appToEdit.name);
            setIssuer(appToEdit.sso.issuer);
            setClientId(appToEdit.sso.clientId);
            setAllowedDomains((appToEdit.sso.allowedDomains ?? []).join('\n'));
            setAllowedEmails((appToEdit.sso.allowedEmails ?? []).join('\n'));
            setEnabled(appToEdit.sso.enabled);
            setErrorMessage(null);
        } else if (isOpen) {
            setName('');
            setIssuer('');
            setClientId('');
            setAllowedDomains('');
            setAllowedEmails('');
            setEnabled(true);
            setErrorMessage(null);
        }
    }, [isOpen, appToEdit]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            setErrorMessage('Name is required');
            return;
        }
        if (!issuer.trim()) {
            setErrorMessage('Issuer URL is required');
            return;
        }
        if (!clientId.trim()) {
            setErrorMessage('Client ID is required');
            return;
        }

        setIsLoading(true);
        setErrorMessage(null);

        try {
            const domains = allowedDomains.split('\n').map(s => s.trim()).filter(Boolean);
            const emails = allowedEmails.split('\n').map(s => s.trim()).filter(Boolean);

            const ssoConfig = {
                enabled,
                issuer: issuer.trim(),
                clientId: clientId.trim(),
                allowedDomains: domains.length > 0 ? domains : null,
                allowedEmails: emails.length > 0 ? emails : null,
            };

            if (appToEdit?.id) {
                await updateSSO(appToEdit.id, { name: name.trim(), sso: ssoConfig });
            } else {
                await createSSO({ name: name.trim(), sso: ssoConfig });
            }
            onCreated();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to save SSO config';
            setErrorMessage(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <Modal>
                {isLoading && <LoadingOverlay><BigSpinner /></LoadingOverlay>}

                <PanelHeader>
                    <PanelTitle>{appToEdit ? 'Edit SSO Config' : 'Add SSO Config'}</PanelTitle>
                    <CloseBtn type="button" onClick={onClose}>×</CloseBtn>
                </PanelHeader>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <FormBody>
                        {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                        <FieldGroup>
                            <Label htmlFor="sso-name">
                                Name <span style={{ color: '#f87171' }}>*</span>
                            </Label>
                            <Input
                                id="sso-name"
                                type="text"
                                placeholder="My SSO Config"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </FieldGroup>

                        <FieldGroup>
                            <Label htmlFor="sso-issuer">
                                Issuer URL <span style={{ color: '#f87171' }}>*</span>
                            </Label>
                            <Input
                                id="sso-issuer"
                                type="url"
                                placeholder="https://accounts.google.com"
                                value={issuer}
                                onChange={e => setIssuer(e.target.value)}
                            />
                            <HelpText>OIDC provider issuer URL (e.g. Google, Okta, Auth0)</HelpText>
                        </FieldGroup>

                        <FieldGroup>
                            <Label htmlFor="sso-client-id">
                                Client ID <span style={{ color: '#f87171' }}>*</span>
                            </Label>
                            <Input
                                id="sso-client-id"
                                type="text"
                                placeholder="123456789.apps.googleusercontent.com"
                                value={clientId}
                                onChange={e => setClientId(e.target.value)}
                            />
                            <HelpText>OAuth 2.0 client ID — validated against JWT audience claim</HelpText>
                        </FieldGroup>

                        <FieldGroup>
                            <Label htmlFor="sso-domains">Allowed Domains</Label>
                            <TextArea
                                id="sso-domains"
                                placeholder={"company.com\npartner.org"}
                                value={allowedDomains}
                                onChange={e => setAllowedDomains(e.target.value)}
                                rows={3}
                            />
                            <HelpText>One domain per line. Leave empty to allow all domains.</HelpText>
                        </FieldGroup>

                        <FieldGroup>
                            <Label htmlFor="sso-emails">Allowed Emails</Label>
                            <TextArea
                                id="sso-emails"
                                placeholder={"alice@company.com\nbob@company.com"}
                                value={allowedEmails}
                                onChange={e => setAllowedEmails(e.target.value)}
                                rows={3}
                            />
                            <HelpText>One email per line. Leave empty to allow all emails.</HelpText>
                        </FieldGroup>

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
                        <SubmitBtn type="submit" disabled={isLoading}>
                            {isLoading && <Spinner />}
                            {appToEdit ? 'Save Changes' : 'Add Config'}
                        </SubmitBtn>
                    </Footer>
                </form>
            </Modal>
        </Overlay>
    );
};

export default CreateSsoModal;
