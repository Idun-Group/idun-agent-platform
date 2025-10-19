import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Form, TextInput } from '../../components/general/form/component';
import { useAuth } from '../../hooks/use-auth';

const Signin = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { signup, session } = useAuth();

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (session) navigate('/agents');
    }, [navigate, session]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // In dev, signup requires an admin session; keep the form for UX but backend will enforce
        await signup({ email, password, name: name || `${firstName} ${lastName}` });
        navigate('/login');
    };

    return (
        <main>
            <StyledForm onSubmit={handleSubmit}>
                <h1>Idun Engine</h1>
                <h2>{t('signin.title')}</h2>
                <p>{t('signin.description')}</p>

                <TextInput
                    label={t('signin.firstName.label')}
                    name="firstName"
                    type="text"
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('signin.firstName.placeholder')}
                    required
                />

                <TextInput
                    label={t('signin.lastName.label')}
                    name="lastName"
                    type="text"
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('signin.lastName.placeholder')}
                    required
                />

                <TextInput
                    label={t('signin.name.label')}
                    name="name"
                    type="text"
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('signin.name.placeholder')}
                    required
                />

                <TextInput
                    label={t('signin.email.label')}
                    name="email"
                    type="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('signin.email.placeholder')}
                    required
                />

                <TextInput
                    label={t('signin.phone.label')}
                    name="phone"
                    type="tel"
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('signin.phone.placeholder')}
                    required
                />
                <TextInput
                    label={t('signin.password.label')}
                    name="password"
                    type="password"
                    onChange={(e) => setPassword(e.target.value)}
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
