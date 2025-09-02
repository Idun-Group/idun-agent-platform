import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Form, TextInput } from '../../components/general/form/component';

const Signin = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            navigate('/agents');
        }
    }, [navigate]);

    return (
        <main>
            <StyledForm>
                <h1>Idun Engine</h1>
                <h2>{t('signin.title')}</h2>
                <p>{t('signin.description')}</p>

                <TextInput
                    label={t('signin.firstName.label')}
                    name="firstName"
                    type="text"
                    placeholder={t('signin.firstName.placeholder')}
                    required
                />

                <TextInput
                    label={t('signin.lastName.label')}
                    name="lastName"
                    type="text"
                    placeholder={t('signin.lastName.placeholder')}
                    required
                />

                <TextInput
                    label={t('signin.name.label')}
                    name="name"
                    type="text"
                    placeholder={t('signin.name.placeholder')}
                    required
                />

                <TextInput
                    label={t('signin.email.label')}
                    name="email"
                    type="email"
                    placeholder={t('signin.email.placeholder')}
                    required
                />

                <TextInput
                    label={t('signin.phone.label')}
                    name="phone"
                    type="tel"
                    placeholder={t('signin.phone.placeholder')}
                    required
                />
                <TextInput
                    label={t('signin.password.label')}
                    name="password"
                    type="password"
                    placeholder={t('signin.password.placeholder')}
                    required
                />
                <Button type="submit" $variants="base">
                    {t('signin.submit')}
                </Button>
            </StyledForm>
        </main>
    );
};

const StyledForm = styled(Form)`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    max-height: none;
    button {
        margin: auto;
    }
    h2 {
        padding: 0;
        margin: 0;
        margin-top: 16px;
    }
    p {
        padding: 0;
        margin: 0;
        margin-bottom: 16px;
    }
`;

export default Signin;
