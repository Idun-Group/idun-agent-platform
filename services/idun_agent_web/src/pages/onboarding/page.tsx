import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { Button } from '../../components/general/button/component';
import { TextInput } from '../../components/general/form/component';
import { useAuth } from '../../hooks/use-auth';
import { postJson } from '../../utils/api';

const OnboardingPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { session, refresh } = useAuth();

    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (session?.principal?.workspace_ids?.length) {
            navigate('/agents', { replace: true });
        }
    }, [session, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setError('');
        setIsSubmitting(true);
        try {
            await postJson('/api/v1/workspaces/', { name: name.trim() });
            await refresh();
            navigate('/agents', { replace: true });
        } catch (err) {
            const message =
                err instanceof Error ? err.message : t('onboarding.error');
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <PageWrapper>
            <ContentPanel>
                <Content>
                    <LogoSection>
                        <LogoImg
                            src="/img/logo/favicon-96x96.png"
                            alt="Idun Platform"
                        />
                        <LogoText>Idun Agent Platform</LogoText>
                    </LogoSection>

                    <HeroSection>
                        <HeroTitle>{t('onboarding.title')}</HeroTitle>
                        <HeroDescription>
                            {t('onboarding.description')}
                        </HeroDescription>
                    </HeroSection>

                    <OnboardingForm onSubmit={handleSubmit} noValidate>
                        <TextInput
                            label={t('onboarding.name.label')}
                            name="workspace-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('onboarding.name.placeholder')}
                            required
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                        <SubmitButton
                            type="submit"
                            $variants="base"
                            disabled={isSubmitting || !name.trim()}
                        >
                            {isSubmitting
                                ? t('onboarding.creating')
                                : t('onboarding.submit')}
                        </SubmitButton>
                    </OnboardingForm>
                </Content>
            </ContentPanel>

            <AccentPanel>
                <AccentContent>
                    <AccentIcon>
                        <svg
                            width="48"
                            height="48"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <rect
                                x="2"
                                y="7"
                                width="20"
                                height="14"
                                rx="2"
                                ry="2"
                            />
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                    </AccentIcon>
                    <AccentTitle>
                        Your workspace is where everything comes together
                    </AccentTitle>
                    <AccentDescription>
                        Manage agents, configure guardrails, set up
                        observability, and collaborate with your team — all in
                        one place.
                    </AccentDescription>
                </AccentContent>
            </AccentPanel>
        </PageWrapper>
    );
};

const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
`;

const PageWrapper = styled.main`
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));

    @media (max-width: 1024px) {
        flex-direction: column;
    }
`;

const ContentPanel = styled.div`
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

const Content = styled.div`
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 28px;
    animation: ${fadeIn} 0.4s ease-out;
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

const OnboardingForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const SubmitButton = styled(Button)`
    width: 100%;
    justify-content: center;
    padding: 12px 20px;
    font-size: 15px;
    font-weight: 600;
    border-radius: 8px;
    margin-top: 4px;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const ErrorText = styled.p`
    color: var(--color-error, #ff4757);
    font-size: 13px;
    margin: 0;
`;

const AccentPanel = styled.div`
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

const AccentContent = styled.div`
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    animation: ${fadeIn} 0.5s ease-out 0.1s both;
`;

const AccentIcon = styled.div`
    width: 72px;
    height: 72px;
    border-radius: 16px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--foreground));
`;

const AccentTitle = styled.h2`
    font-size: 22px;
    font-weight: 700;
    color: hsl(var(--foreground));
    letter-spacing: -0.3px;
    line-height: 1.3;
`;

const AccentDescription = styled.p`
    font-size: 15px;
    color: hsl(var(--muted-foreground));
    line-height: 1.6;
    margin: 0;
`;

export default OnboardingPage;
