import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import useWorkspace from '../../../hooks/use-workspace';
import { patchJson, getJson } from '../../../utils/api';

type Workspace = {
    id: string;
    name: string;
    slug: string;
};

const WorkspaceGeneralTab = () => {
    const { t } = useTranslation();
    const { selectedWorkspaceId } = useWorkspace();
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchWorkspace = useCallback(async () => {
        setLoading(true);
        try {
            const workspaces = await getJson<Workspace[]>('/api/v1/workspaces/');
            const ws = selectedWorkspaceId
                ? workspaces.find((w) => w.id === selectedWorkspaceId)
                : workspaces[0];
            if (ws) {
                setWorkspace(ws);
                setName(ws.name);
            }
        } catch {
            // workspace data not available
        } finally {
            setLoading(false);
        }
    }, [selectedWorkspaceId]);

    useEffect(() => {
        fetchWorkspace();
    }, [fetchWorkspace]);

    const handleSave = async () => {
        if (!workspace || !name.trim() || name === workspace.name) return;
        setSaving(true);
        try {
            const updated = await patchJson<Workspace, { name: string }>(
                `/api/v1/workspaces/${workspace.id}`,
                { name: name.trim() },
            );
            setWorkspace(updated);
            toast.success(
                t(
                    'settings.workspaces.general.renameSuccess',
                    'Workspace renamed successfully',
                ),
            );
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Failed to rename workspace';
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <LoadingText>{t('common.loading', 'Loading...')}</LoadingText>;
    }

    if (!workspace) {
        return (
            <EmptyText>
                {t(
                    'settings.workspaces.general.noWorkspace',
                    'No workspace selected',
                )}
            </EmptyText>
        );
    }

    const hasChanges = name.trim() !== workspace.name && name.trim().length > 0;

    return (
        <Container>
            {/* Rename workspace */}
            <Card>
                <CardTitle>
                    {t(
                        'settings.workspaces.general.rename',
                        'Workspace Name',
                    )}
                </CardTitle>
                <CardDescription>
                    {t(
                        'settings.workspaces.general.renameDescription',
                        'Change the display name of your workspace.',
                    )}
                </CardDescription>
                <FormRow>
                    <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t(
                            'settings.workspaces.general.namePlaceholder',
                            'Workspace name',
                        )}
                        maxLength={255}
                    />
                    <SaveButton
                        onClick={handleSave}
                        disabled={!hasChanges || saving}
                    >
                        {saving
                            ? t('common.saving', 'Saving...')
                            : t('common.save', 'Save')}
                    </SaveButton>
                </FormRow>
                <MetaRow>
                    <MetaLabel>ID</MetaLabel>
                    <MetaValue>{workspace.id}</MetaValue>
                </MetaRow>
                <MetaRow>
                    <MetaLabel>Slug</MetaLabel>
                    <MetaValue>{workspace.slug}</MetaValue>
                </MetaRow>
            </Card>

            {/* Spaces placeholder */}
            <Card>
                <CardTitle>
                    {t('settings.workspaces.general.spaces', 'Spaces')}
                </CardTitle>
                <CardDescription>
                    {t(
                        'settings.workspaces.general.spacesDescription',
                        'Spaces within this workspace. Manage spaces from the main dashboard.',
                    )}
                </CardDescription>
                <PlaceholderText>
                    {t(
                        'settings.workspaces.general.spacesComingSoon',
                        'Space management will be available here soon.',
                    )}
                </PlaceholderText>
            </Card>
        </Container>
    );
};

export default WorkspaceGeneralTab;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const Card = styled.div`
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 24px;
`;

const CardTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px 0;
`;

const CardDescription = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0 0 20px 0;
`;

const FormRow = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
`;

const Input = styled.input`
    flex: 1;
    padding: 10px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-family: inherit;
    transition: border-color 150ms ease;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const SaveButton = styled.button`
    padding: 10px 20px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 8px;
    color: hsl(var(--primary-foreground));
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;

    &:hover:not(:disabled) {
        filter: brightness(0.9);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const MetaRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
`;

const MetaLabel = styled.span`
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
    min-width: 40px;
`;

const MetaValue = styled.span`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    font-family: 'SF Mono', 'Fira Code', monospace;
`;

const LoadingText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    padding: 24px 0;
`;

const EmptyText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    padding: 24px 0;
`;

const PlaceholderText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    padding: 16px;
    background: var(--overlay-subtle);
    border-radius: 6px;
    border: 1px dashed var(--border-light);
    margin: 0;
`;
