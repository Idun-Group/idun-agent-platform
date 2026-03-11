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
            </Card>
        </PageWrapper>
    );
};

const PageWrapper = styled.main`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: hsl(var(--background));
    padding: 24px;
`;

const Card = styled.div`
    width: 100%;
    max-width: 440px;
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

const Header = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Title = styled.h1`
    font-size: 28px;
    font-weight: 700;
    color: hsl(var(--foreground));
    letter-spacing: -0.5px;
    margin: 0;
`;

const Description = styled.p`
    font-size: 15px;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
    margin: 0;
`;

const StyledForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 8px;
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

export default OnboardingPage;
