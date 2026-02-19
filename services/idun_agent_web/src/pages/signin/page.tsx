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

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (session) navigate('/agents');
    }, [navigate, session]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await signup({ email, password, name });
        navigate('/login');
    };

    return (
        <main>
            <StyledForm onSubmit={handleSubmit}>
                <h1>Idun Agent Platform</h1>
                <h2>{t('signin.title')}</h2>
                <p>{t('signin.description')}</p>

                <TextInput
                    label={t('signin.email.label', { defaultValue: 'Email' })}
                    name="email"
                    type="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                />
                <TextInput
                    label={t('signin.password.label', { defaultValue: 'Password' })}
                    name="password"
                    type="password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                />
                <TextInput
                    label={t('signin.name.label', { defaultValue: 'Name' })}
                    name="name"
                    type="text"
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
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
