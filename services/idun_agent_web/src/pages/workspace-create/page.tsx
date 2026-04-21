import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft } from 'lucide-react';

import { Button } from '../../components/general/button/component';
import { TextInput, TextArea } from '../../components/general/form/component';
import { useAuth } from '../../hooks/use-auth';
import useWorkspace from '../../hooks/use-workspace';
import { useProject } from '../../hooks/use-project';
import { postJson } from '../../utils/api';
import { notify } from '../../components/toast/notify';

interface CreatedWorkspace {
    id: string;
    name: string;
    default_project_id?: string | null;
}

const WorkspaceCreatePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const { setSelectedWorkspaceId } = useWorkspace();
    const { refreshProjects } = useProject();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || isCreating) return;
        setError('');
        setIsCreating(true);
        try {
            const created = await postJson<CreatedWorkspace>('/api/v1/workspaces/', {
                name: trimmed,
                description: description.trim() || undefined,
            });
            await refresh();
            setSelectedWorkspaceId(created.id);
            await refreshProjects();
            notify.success(
                t('workspaceCreate.success', '{{name}} is ready', { name: created.name }),
            );
            navigate('/agents', { replace: true });
        } catch (err) {
            const message =
                err instanceof Error && err.message
                    ? err.message
                    : t(
                          'workspaceCreate.error',
                          'Could not create the workspace. Please try again.',
                      );
            setError(message);
            setIsCreating(false);
        }
    };

    return (
        <PageWrapper>
            <TopBar>
                <BackLink onClick={() => navigate(-1)}>
                    <ArrowLeft size={14} />
                    {t('common.back', 'Back')}
                </BackLink>
            </TopBar>

            <Card>
                <Header>
                    <Title>{t('workspaceCreate.title', 'Create a workspace')}</Title>
                    <Description>
                        {t(
                            'workspaceCreate.intro',
                            'Workspaces isolate tenants on the platform. Each workspace starts with a default project where you can configure agents and resources.',
                        )}
                    </Description>
                </Header>

                <StyledForm onSubmit={handleSubmit}>
                    <TextInput
                        label={t('workspaceCreate.name.label', 'Workspace name')}
                        name="workspace-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t(
                            'workspaceCreate.name.placeholder',
                            'e.g. Acme Production',
                        )}
                        required
                    />
                    <TextArea
                        label={t('workspaceCreate.description.label', 'Description (optional)')}
                        name="workspace-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t(
                            'workspaceCreate.description.placeholder',
                            'What will this workspace be used for?',
                        )}
                    />
                    {error && <ErrorText>{error}</ErrorText>}
                    <Actions>
                        <CancelButton
                            type="button"
                            $variants="base"
                            onClick={() => navigate(-1)}
                            disabled={isCreating}
                        >
                            {t('common.cancel', 'Cancel')}
                        </CancelButton>
                        <SubmitButton
                            type="submit"
                            $variants="base"
                            disabled={isCreating || !name.trim()}
                        >
                            {isCreating
                                ? t('workspaceCreate.submitting', 'Creating…')
                                : t('workspaceCreate.submit', 'Create workspace')}
                        </SubmitButton>
                    </Actions>
                </StyledForm>
            </Card>
        </PageWrapper>
    );
};

const PageWrapper = styled.main`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 24px 80px;
    background: hsl(var(--background));
    min-height: 100%;
`;

const TopBar = styled.div`
    width: 100%;
    max-width: 560px;
    margin-bottom: 20px;
`;

const BackLink = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    padding: 6px 10px 6px 6px;
    border-radius: 7px;
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: color 150ms ease, background 150ms ease;

    &:hover {
        color: hsl(var(--foreground));
        background: var(--overlay-light);
    }
`;

const Card = styled.div`
    width: 100%;
    max-width: 560px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const Header = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Title = styled.h1`
    font-size: 22px;
    font-weight: 700;
    color: hsl(var(--foreground));
    letter-spacing: -0.3px;
    margin: 0;
`;

const Description = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
    margin: 0;
`;

const StyledForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 4px;
`;

const SubmitButton = styled(Button)`
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 8px;
`;

const CancelButton = styled(Button)`
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    background: transparent;
    border: 1px solid var(--border-subtle);
    color: hsl(var(--foreground));

    &:hover:not(:disabled) {
        background: var(--overlay-light);
    }
`;

const ErrorText = styled.p`
    color: hsl(var(--destructive));
    font-size: 13px;
    margin: 0;
`;

export default WorkspaceCreatePage;
