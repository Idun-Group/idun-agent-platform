import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from '../../toast/notify';
import styled from 'styled-components';
import useWorkspace from '../../../hooks/use-workspace';
import { patchJson, getJson } from '../../../utils/api';

type Workspace = {
    id: string;
    name: string;
    slug: string;
    is_owner?: boolean;
    default_project_id?: string | null;
};

const WorkspaceGeneralTab = () => {
    const { t } = useTranslation();
    const { selectedWorkspaceId, isCurrentWorkspaceOwner } = useWorkspace();
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
            notify.success(
                t(
                    'settings.workspaces.general.renameSuccess',
                    'Workspace renamed successfully',
                ),
            );
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Failed to rename workspace';
            notify.error(message);
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

    const hasChanges =
        isCurrentWorkspaceOwner &&
        name.trim() !== workspace.name &&
        name.trim().length > 0;

    return (
        <Container>
            {/* Rename workspace */}
            <SectionCard>
                <SectionTitle>
                    {t(
                        'settings.workspaces.general.rename',
                        'Workspace Name',
                    )}
                </SectionTitle>
                <FormRow>
                    <StyledInput
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t(
                            'settings.workspaces.general.namePlaceholder',
                            'Workspace name',
                        )}
                        maxLength={255}
                    />
                    <PrimaryButton onClick={handleSave} disabled={!hasChanges || saving}>
                        {saving
                            ? t('common.saving', 'Saving...')
                            : t('common.save', 'Save')}
                    </PrimaryButton>
                </FormRow>
            </SectionCard>

            {/* Details */}
            <SectionCard>
                <SectionTitle>
                    {t('settings.workspaces.general.details', 'Details')}
                </SectionTitle>
                <MetaGrid>
                    <MetaItem>
                        <MetaLabel>ID</MetaLabel>
                        <MetaValue>{workspace.id}</MetaValue>
                    </MetaItem>
                    <MetaItem>
                        <MetaLabel>Slug</MetaLabel>
                        <MetaValue>{workspace.slug}</MetaValue>
                    </MetaItem>
                    <MetaItem>
                        <MetaLabel>Role</MetaLabel>
                        <MetaValue style={{ color: 'hsl(var(--primary))', fontFamily: 'inherit' }}>
                            {isCurrentWorkspaceOwner ? 'Owner' : 'Member'}
                        </MetaValue>
                    </MetaItem>
                    <MetaItem>
                        <MetaLabel>Default Project</MetaLabel>
                        <MetaValue style={{ fontFamily: 'inherit' }}>
                            {workspace.default_project_id ?? '—'}
                        </MetaValue>
                    </MetaItem>
                </MetaGrid>
            </SectionCard>
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
    gap: 14px;
`;

const SectionCard = styled.div`
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 18px;
`;

const SectionTitle = styled.h4`
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin: 0 0 12px;
`;

const FormRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: flex-start;
`;

const StyledInput = styled.input`
    flex: 1;
    padding: 9px 12px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 7px;
    font-size: 13px;
    color: hsl(var(--foreground));
    font-family: inherit;
    transition: border-color 150ms ease;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.2);
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const PrimaryButton = styled.button`
    padding: 9px 16px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    transition: opacity 150ms ease;

    &:hover { opacity: 0.9; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const MetaGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
`;

const MetaItem = styled.div``;

const MetaLabel = styled.div`
    font-size: 10px;
    color: hsl(var(--muted-foreground));
    margin-bottom: 3px;
`;

const MetaValue = styled.div`
    font-size: 12px;
    color: hsl(var(--foreground));
    opacity: 0.7;
    font-family: var(--font-mono, monospace);
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
