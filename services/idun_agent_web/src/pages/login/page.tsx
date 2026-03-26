import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextInput } from '../../components/general/form/component';
import { useAuth } from '../../hooks/use-auth';
import { runtimeConfig } from '../../utils/runtime-config';
import { getJson } from '../../utils/api';
import { ExternalLink, Github, Globe, Calendar } from 'lucide-react';

const isBasicAuthEnabled = runtimeConfig.AUTH_DISABLE_USERNAME_PASSWORD !== 'true';

const MEETING_URL = 'https://calendar.app.google/SsPfBpWyAQuabxhQ6';
const LANDING_URL = 'https://idunplatform.com/';
const GITHUB_URL = 'https://github.com/Idun-Group/idun-agent-platform';

interface TestimonialData {
    quote: string;
    name: string;
    title: string;
    image: string;
}

const testimonials: TestimonialData[] = [
    {
        quote: 'Idun Platform brings together all the tools needed to orchestrate our AI agents. It lets us significantly accelerate the deployment of our generative AI ambitions.',
        name: 'Cyriac Azefack',
        title: 'Generative AI Lead, Richemont',
        image: '/img/cyriac azefack.jpeg',
    },
    {
        quote: "Idun Platform brings together what's essential for industrialising AI agents, from governance to observability. It gives you the confidence to move from POC to production.",
        name: 'Atilla Topo',
        title: 'Head of Cloud, AXA Partners',
        image: '/img/atilla topo.jpeg',
    },
];

const PROVIDER_CONFIG: Record<string, { logo: string; labelKey: string; defaultLabel: string }> = {
    google: { logo: '/img/google-logo.svg', labelKey: 'login.sso.google', defaultLabel: 'Continue with Google' },
    microsoft: { logo: '/img/microsoft-logo.svg', labelKey: 'login.sso.microsoft', defaultLabel: 'Continue with Microsoft' },
};

const LoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { session, login, loginOIDC } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [providers, setProviders] = useState<string[]>([]);

    useEffect(() => {
        if (session) {
            const hasWorkspaces = (session.principal?.workspace_ids?.length ?? 0) > 0;
            if (!hasWorkspaces) {
                navigate('/onboarding', { replace: true });
            } else {
                const returnUrl = sessionStorage.getItem('returnUrl') || '/agents';
                sessionStorage.removeItem('returnUrl');
                navigate(returnUrl, { replace: true });
            }
        }
    }, [session, navigate]);

    useEffect(() => {
        if (!isBasicAuthEnabled) {
            getJson<{ providers: string[] }>('/api/v1/auth/providers')
                .then((res) => setProviders(res.providers))
                .catch(() => setProviders(Object.keys(PROVIDER_CONFIG)));
        }
    }, []);

    const handleBasicLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
        } catch {
            setError('Invalid email or password');
        }
    };

    return (
        <PageWrapper>
            <LeftPanel>
                <LeftContent>
                    <LogoSection>
                        <LogoImg src="/img/logo/favicon-96x96.png" alt="Idun Platform" />
                        <LogoText>Idun Agent Platform</LogoText>
                    </LogoSection>

                    <HeroSection>
                        <HeroTitle>{t('login.title')}</HeroTitle>
                        <HeroDescription>{t('login.description')}</HeroDescription>
                    </HeroSection>

                    {isBasicAuthEnabled ? (
                        <AuthForm onSubmit={handleBasicLogin} noValidate>
                            <TextInput
                                label={t('login.email', { defaultValue: 'Email' })}
                                name="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder={t('login.email.placeholder', { defaultValue: 'Email' })}
                                required
                            />
                            <TextInput
                                label={t('login.password', { defaultValue: 'Password' })}
                                name="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t('login.password.placeholder', { defaultValue: 'Password' })}
                                required
                            />
                            {error && <ErrorText>{error}</ErrorText>}
                            <SubmitButton type="submit" $variants="base">
                                {t('login.submit', { defaultValue: 'Sign In' })}
                            </SubmitButton>

                            <SignupLink onClick={() => navigate('/signin')}>
                                {t('login.signup', { defaultValue: "Don't have an account? Sign up" })}
                            </SignupLink>
                        </AuthForm>
                    ) : (
                        <AuthForm onSubmit={(e) => e.preventDefault()} noValidate>
                            {providers.map((provider) => {
                                const cfg = PROVIDER_CONFIG[provider];
                                if (!cfg) return null;
                                return (
                                    <SSOButton key={provider} type="button" onClick={() => loginOIDC(provider)}>
                                        <ProviderLogo src={cfg.logo} alt={provider} />
                                        <span>{t(cfg.labelKey, { defaultValue: cfg.defaultLabel })}</span>
                                    </SSOButton>
                                );
                            })}
                        </AuthForm>
                    )}

                    <MeetingSection>
                        <MeetingText>Want to learn more about the platform?</MeetingText>
                        <MeetingButton
                            href={MEETING_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Calendar size={16} />
                            Book a meeting with the team
                            <ExternalLink size={14} />
                        </MeetingButton>
                    </MeetingSection>

                    <FooterLinks>
                        <FooterLink href={LANDING_URL} target="_blank" rel="noopener noreferrer">
                            <Globe size={14} />
                            idunplatform.com
                        </FooterLink>
                        <FooterDot />
                        <FooterLink href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                            <Github size={14} />
                            GitHub
                        </FooterLink>
                    </FooterLinks>
                </LeftContent>
            </LeftPanel>

            <RightPanel>
                <RightContent>
                    <PlatformImage src="/img/platform-login-image.jpg" alt="Idun Agent Platform" />

                    <TestimonialsSection>
                        {testimonials.map((t, i) => (
                            <TestimonialCard key={i}>
                                <QuoteText>&ldquo;{t.quote}&rdquo;</QuoteText>
                                <TestimonialAuthor>
                                    <AuthorAvatar src={t.image} alt={t.name} />
                                    <AuthorInfo>
                                        <AuthorName>{t.name}</AuthorName>
                                        <AuthorTitle>{t.title}</AuthorTitle>
                                    </AuthorInfo>
                                </TestimonialAuthor>
                            </TestimonialCard>
                        ))}
                    </TestimonialsSection>
                </RightContent>
            </RightPanel>
        </PageWrapper>
    );
};

const PageWrapper = styled.main`
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));

    @media (max-width: 1024px) {
        flex-direction: column;
    }
`;

const LeftPanel = styled.div`
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 32px;
    min-height: 100vh;

    @media (max-width: 1024px) {
        min-height: auto;
        padding: 32px 24px;
    }
`;

const LeftContent = styled.div`
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 28px;
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
    font-weight: 700;
    color: hsl(var(--foreground));
    letter-spacing: -0.3px;
`;

const HeroSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const HeroTitle = styled.h1`
    font-size: 28px;
    font-weight: 700;
    color: hsl(var(--foreground));
    letter-spacing: -0.5px;
`;

const HeroDescription = styled.p`
    font-size: 15px;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
    margin: 0;
`;

const AuthForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const SubmitButton = styled(Button)`
    width: 100%;
    justify-content: center;
    padding: 12px 20px;
    font-size: 15px;
    font-weight: 600;
    border-radius: 8px;
    margin-top: 4px;
`;

const ErrorText = styled.p`
    color: hsl(var(--destructive));
    font-size: 13px;
    margin: 0;
`;

const SSOButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 12px 20px;
    background: transparent;
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background: hsl(var(--accent));
        border-color: hsl(var(--muted-foreground));
    }
`;

const ProviderLogo = styled.img`
    width: 20px;
    height: 20px;
`;

const SignupLink = styled.span`
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    text-align: center;
    font-size: 14px;
    margin-top: 4px;

    &:hover {
        color: hsl(var(--primary));
        text-decoration: underline;
    }
`;

const MeetingSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 8px;
    border-top: 1px solid hsl(var(--border));
`;

const MeetingText = styled.span`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
`;

const MeetingButton = styled.a`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--primary));
    text-decoration: none;
    transition: opacity 0.2s ease;

    &:hover {
        opacity: 0.8;
        text-decoration: underline;
    }
`;

const FooterLinks = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const FooterLink = styled.a`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    transition: color 0.2s ease;

    &:hover {
        color: hsl(var(--foreground));
    }
`;

const FooterDot = styled.span`
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: hsl(var(--muted-foreground));
`;

const RightPanel = styled.div`
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 32px;
    background: hsl(var(--muted));
    border-left: 1px solid hsl(var(--border));

    @media (max-width: 1024px) {
        border-left: none;
        border-top: 1px solid hsl(var(--border));
        padding: 32px 24px;
    }
`;

const RightContent = styled.div`
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 32px;
`;

const PlatformImage = styled.img`
    width: 100%;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
`;

const TestimonialsSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const TestimonialCard = styled.div`
    padding: 20px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const QuoteText = styled.p`
    font-size: 14px;
    line-height: 1.6;
    color: hsl(var(--foreground));
    margin: 0;
    font-style: italic;
`;

const TestimonialAuthor = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const AuthorAvatar = styled.img`
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
`;

const AuthorInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const AuthorName = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const AuthorTitle = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

export default LoginPage;
