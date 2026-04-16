import React, { useState } from 'react';
import { Button } from '../../general/button/component';
import { notify } from '../../toast/notify';
import { t } from 'i18next';
import styled from 'styled-components';
import {
    Form,
    LabeledToggleButton,
    TextInput,
} from '../../general/form/component';

const SecuritySettings = () => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleSubmitPasswordChange = (
        e: React.FormEvent<HTMLFormElement>
    ) => {
        e.preventDefault();
        notify.success('Mot de passe mis à jour avec succès');
    };

    return (
        <Container>
            <Title>Security Settings</Title>
            <Description>Manage your security settings and preferences.</Description>

            <Form onSubmit={handleSubmitPasswordChange}>
                <TextInput
                    label={t('settings.security.current-password.label')}
                    placeholder={t(
                        'settings.security.current-password.placeholder'
                    )}
                    type="password"
                    value={currentPassword}
                    required
                    onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <TextInput
                    label={t('settings.security.new-password.label')}
                    placeholder={t(
                        'settings.security.new-password.placeholder'
                    )}
                    type="password"
                    value={newPassword}
                    required
                    onChange={(e) => setNewPassword(e.target.value)}
                />
                <TextInput
                    label={t('settings.security.confirm-password.label')}
                    placeholder={t(
                        'settings.security.confirm-password.placeholder'
                    )}
                    type="password"
                    value={confirmPassword}
                    required
                    onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Button $variants="base">
                    {t('settings.security.submit')}
                </Button>
            </Form>

            <LabeledToggleButton
                label={t('settings.security.2FA.label')}
                subLabel={t('settings.security.2FA.description')}
                isOn={true}
                onToggle={() => {}}
            />
            <LabeledToggleButton
                label={t('settings.security.alert.label')}
                subLabel={t('settings.security.alert.description')}
                isOn={true}
                onToggle={() => {}}
            />
        </Container>
    );
};
export default SecuritySettings;

const Container = styled.div`
    font-family: 'IBM Plex Sans', sans-serif;
`;

const Title = styled.h1`
    font-size: 20px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0 0 4px 0;
`;

const Description = styled.p`
    font-size: 14px;
    color: #8899a6;
    margin: 0 0 20px 0;
`;
