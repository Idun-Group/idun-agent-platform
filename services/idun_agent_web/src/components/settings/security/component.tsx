import React, { useState } from 'react';
import { Button } from '../../general/button/component';
import { toast } from 'react-toastify';
import { t } from 'i18next';
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
        toast.success('Mot de passe mis à jour avec succès');
    };

    return (
        <div>
            <h1>Security Settings</h1>
            <p>Manage your security settings and preferences.</p>

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

            {/* Your component implementation here */}
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
        </div>
    );
};
export default SecuritySettings;
