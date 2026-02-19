import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, TextInput } from '../../components/general/form/component';
import { useAuth } from '../../hooks/use-auth';

const isBasicAuthEnabled = import.meta.env.VITE_AUTH_DISABLE_USERNAME_PASSWORD !== 'true';

const LoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { session, login, loginOIDC } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (session) {
            navigate('/agents', { replace: true });
        }
    }, [session, navigate]);

    const handleBasicLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
        } catch {
            setError('Invalid email or password');
        }
    };

    if (isBasicAuthEnabled) {
        return (
            <main>
                <StyledForm onSubmit={handleBasicLogin} noValidate>
                    <h1>Idun Agent Platform</h1>
                    <h2>{t('login.title')}</h2>
                    <p>{t('login.description')}</p>

                    <TextInput
                        label={t('login.email', { defaultValue: 'Email' })}
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                    />
                    <TextInput
                        label={t('login.password', { defaultValue: 'Password' })}
                        name="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                    />
                    {error && <ErrorText>{error}</ErrorText>}
                    <Button type="submit" $variants="base">
                        {t('login.submit', { defaultValue: 'Sign In' })}
                    </Button>
                    <SignupLink onClick={() => navigate('/signin')}>
                        {t('login.signup', { defaultValue: "Don't have an account? Sign up" })}
                    </SignupLink>
                </StyledForm>
            </main>
        );
    }

    return (
        <main>
            <StyledForm onSubmit={(e) => e.preventDefault()} noValidate>
                <h1>Idun Agent Platform</h1>
                <h2>{t('login.title')}</h2>
                <p>{t('login.description')}</p>

                <Button type="button" $variants="base" onClick={loginOIDC}>
                    {t('login.sso', { defaultValue: 'Continue with Google' })}
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

const ErrorText = styled.p`
    color: var(--color-error, red);
    font-size: 14px;
`;

const SignupLink = styled.span`
    cursor: pointer;
    color: var(--color-primary);
    text-align: center;
    margin-top: 16px;
    &:hover {
        text-decoration: underline;
    }
`;

export default LoginPage;
