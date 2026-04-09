import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Form, TextInput } from '../../components/general/form/component';
import { useAuth } from '../../hooks/use-auth';

const FIELD_LABELS: Record<string, string> = {
    email: 'Email',
    password: 'Password',
    name: 'Name',
};

const FRIENDLY_MESSAGES: Record<string, Record<string, string>> = {
    email: {
        value_error: 'Please enter a valid email address',
    },
    password: {
        string_too_short: 'Password must be at least 8 characters',
    },
};

const DEFAULT_ERROR = 'Sign up failed. Please try again.';

function extractErrorMessage(err: unknown): string {
    if (!(err instanceof Error) || !err.message) return DEFAULT_ERROR;

    try {
        const parsed = JSON.parse(err.message);
        if (!parsed.detail) return DEFAULT_ERROR;

        // String detail: "Email already registered", "Database error", etc.
        if (typeof parsed.detail === 'string') return parsed.detail;

        // Array detail: Pydantic validation errors
        if (Array.isArray(parsed.detail)) {
            const messages = parsed.detail.map(
                (item: { type?: string; loc?: string[]; msg?: string }) => {
                    const field = item.loc?.find((l) => l !== 'body') || '';
                    const friendly = FRIENDLY_MESSAGES[field]?.[item.type || ''];
                    if (friendly) return friendly;

                    const label = FIELD_LABELS[field] || field || 'Field';
                    const msg = item.msg || 'is invalid';
                    return `${label}: ${msg}`;
                },
            );
            return messages.join('. ');
        }

        return DEFAULT_ERROR;
    } catch {
        return DEFAULT_ERROR;
    }
}

const Signin = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { signup, session } = useAuth();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (session) {
            const hasWorkspaces = (session.principal?.workspace_ids?.length ?? 0) > 0;
            navigate(hasWorkspaces ? '/agents' : '/onboarding');
        }
    }, [navigate, session]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await signup({ email, password, name });
            // Navigation is handled by the useEffect above once session is set.
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    return (
        <PageWrapper>
            <Card>
                <LogoSection>
                    <LogoImg src="/img/logo/favicon-96x96.png" alt="Idun Platform" />
                    <LogoText>Idun Agent Platform</LogoText>
                </LogoSection>

                <Header>
                    <Title>{t('signin.title')}</Title>
                    <Description>{t('signin.description')}</Description>
                </Header>

                <StyledForm onSubmit={handleSubmit}>
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
                    {error && <ErrorText>{error}</ErrorText>}
                    <SubmitButton type="submit" $variants="base">
                        {t('signin.submit')}
                    </SubmitButton>

                    <LoginLink onClick={() => navigate('/login')}>
                        Already have an account? Sign in
                    </LoginLink>
                </StyledForm>
            </Card>
        </PageWrapper>
    );
};

const PageWrapper = styled.main`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #0a0e17;
    font-family: 'IBM Plex Sans', sans-serif;
    padding: 24px;
`;

const Card = styled.div`
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding: 40px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    backdrop-filter: blur(12px);
`;

const LogoSection = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const LogoImg = styled.img`
    width: 36px;
    height: 36px;
    border-radius: 8px;
`;

const LogoText = styled.span`
    font-size: 18px;
    font-weight: 600;
    color: #e2e8f0;
    letter-spacing: -0.3px;
`;

const Header = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Title = styled.h2`
    font-size: 24px;
    font-weight: 600;
    color: #f1f5f9;
    letter-spacing: -0.3px;
    margin: 0;
`;

const Description = styled.p`
    font-size: 15px;
    color: #7a8ba5;
    line-height: 1.6;
    margin: 0;
`;

const StyledForm = styled(Form)`
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: none;
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;

    button {
        width: 100%;
    }
`;

const SubmitButton = styled(Button)`
    width: 100%;
    justify-content: center;
    padding: 12px 20px;
    font-size: 15px;
    font-weight: 600;
    border-radius: 8px;
    margin-top: 4px;
    background: #0C5CAB;
    border: 1px solid rgba(12, 92, 171, 0.4);
    color: #ffffff;
    transition: all 0.2s ease;

    &:hover {
        background: #0a4f96;
        border-color: rgba(12, 92, 171, 0.6);
        box-shadow: 0 0 16px rgba(12, 92, 171, 0.25);
    }
`;

const ErrorText = styled.p`
    color: #f87171;
    font-size: 13px;
    margin: 0;
`;

const LoginLink = styled.span`
    cursor: pointer;
    color: #7a8ba5;
    text-align: center;
    font-size: 14px;
    margin-top: 4px;
    transition: color 0.2s ease;

    &:hover {
        color: #4a9eed;
        text-decoration: underline;
    }
`;

export default Signin;
