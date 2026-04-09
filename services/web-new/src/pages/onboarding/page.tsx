import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
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
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (session) {
            const hasWorkspaces = (session.principal?.workspace_ids?.length ?? 0) > 0;
            if (hasWorkspaces) {
                navigate('/agents', { replace: true });
            }
        }
    }, [session, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || isCreating) return;
        setError('');
        setIsCreating(true);
        try {
            await postJson('/api/v1/workspaces/', { name: name.trim() });
            await refresh();
            navigate('/agents', { replace: true });
        } catch {
            setError(t('onboarding.error'));
            setIsCreating(false);
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
                    <Title>{t('onboarding.title')}</Title>
                    <Description>{t('onboarding.description')}</Description>
                </Header>

                <StyledForm onSubmit={handleSubmit}>
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
                    <SubmitButton type="submit" $variants="base" disabled={isCreating || !name.trim()}>
                        {isCreating ? t('onboarding.creating') : t('onboarding.submit')}
                    </SubmitButton>
                </StyledForm>

                <StepIndicator>
                    <StepDot $active />
                    <StepDot />
                    <StepDot />
                </StepIndicator>
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

const Title = styled.h1`
    font-size: 28px;
    font-weight: 600;
    color: #f1f5f9;
    letter-spacing: -0.5px;
    margin: 0;
`;

const Description = styled.p`
    font-size: 15px;
    color: #7a8ba5;
    line-height: 1.6;
    margin: 0;
`;

const StyledForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 16px;
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

    &:disabled {
        background: rgba(12, 92, 171, 0.3);
        border-color: rgba(12, 92, 171, 0.15);
        color: rgba(255, 255, 255, 0.4);
        cursor: not-allowed;
    }
`;

const ErrorText = styled.p`
    color: #f87171;
    font-size: 13px;
    margin: 0;
`;

const StepIndicator = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding-top: 8px;
`;

const StepDot = styled.div<{ $active?: boolean }>`
    width: ${({ $active }) => ($active ? '24px' : '8px')};
    height: 8px;
    border-radius: 4px;
    background: ${({ $active }) => ($active ? '#0C5CAB' : 'rgba(255, 255, 255, 0.1)')};
    transition: all 0.3s ease;
`;

export default OnboardingPage;
