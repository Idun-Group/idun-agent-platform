import React from 'react';
import { SquarePen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '../../general/button/component';
import { toast } from 'react-toastify';
import { Form, TextInput } from '../../general/form/component';

const ProfileSettings = () => {
    const { t } = useTranslation();

    const [enableNameEditing, setEnableNameEditing] = React.useState(false);
    const [enableEmailEditing, setEnableEmailEditing] = React.useState(false);
    const [enablePhoneEditing, setEnablePhoneEditing] = React.useState(false);
    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [phone, setPhone] = React.useState('');
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Handle form submission
        const data = {
            name,
            email,
            phone,
        };
        console.log(data);
        toast.success('not implemented');
    };
    return (
        <Form
            style={{ height: 'auto', maxHeight: 'none' }}
            onSubmit={handleSubmit}
        >
            <h1>{t('settings.profile.title')}</h1>
            <p>{t('settings.profile.description')}</p>

            <UpdatableFieldContainer>
                <TextInput
                    label={t('settings.profile.name.label')}
                    name="name"
                    placeholder={t('settings.profile.name.placeholder')}
                    disabled={!enableNameEditing}
                    onChange={(e) => setName(e.target.value)}
                    autocomplete="name"
                />
                <Button
                    $variants="base"
                    onClick={() => setEnableNameEditing(!enableNameEditing)}
                    type="button"
                >
                    <SquarePen />
                </Button>
            </UpdatableFieldContainer>

            <TextInput
                label={t('settings.profile.firstName.label')}
                name="firstName"
                placeholder={t('settings.profile.firstName.placeholder')}
                autocomplete="given-name"
                disabled
            />

            <TextInput
                label={t('settings.profile.lastName.label')}
                name="lastName"
                placeholder={t('settings.profile.lastName.placeholder')}
                autocomplete="family-name"
                disabled
            />

            <UpdatableFieldContainer>
                <TextInput
                    label={t('settings.profile.email.label')}
                    name="email"
                    disabled={!enableEmailEditing}
                    placeholder={t('settings.profile.email.placeholder')}
                    onChange={(e) => setEmail(e.target.value)}
                    autocomplete="email"
                />
                <Button
                    $variants="base"
                    type="button"
                    onClick={() => setEnableEmailEditing(!enableEmailEditing)}
                >
                    <SquarePen />
                </Button>
            </UpdatableFieldContainer>

            <UpdatableFieldContainer>
                <TextInput
                    label={t('settings.profile.phone.label')}
                    name="phone"
                    placeholder={t('settings.profile.phone.placeholder')}
                    disabled={!enablePhoneEditing}
                    onChange={(e) => setPhone(e.target.value)}
                    autocomplete="tel"
                />
                <Button
                    $variants="base"
                    type="button"
                    onClick={() => setEnablePhoneEditing(!enablePhoneEditing)}
                >
                    <SquarePen />
                </Button>
            </UpdatableFieldContainer>
            <Button
                $variants="base"
                $color="primary"
                type="submit"
                style={{ marginTop: '16px' }}
            >
                {t('settings.profile.save')}
            </Button>
        </Form>
    );
};
export default ProfileSettings;

// const Form = styled.form`
//     display: flex;
//     flex-direction: column;
//     gap: 16px;
//     margin-top: 32px;
// `;

const UpdatableFieldContainer = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
`;
