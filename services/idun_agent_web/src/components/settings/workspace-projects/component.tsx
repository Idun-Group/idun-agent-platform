import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Plus, Pencil, Trash2, Check, X, Grid3X3 } from 'lucide-react';
import { notify } from '../../toast/notify';
import { useProject } from '../../../hooks/use-project';

const WorkspaceProjectsTab = () => {
    const { t } = useTranslation();
    const {
        projects,
        projectRoles,
        isWorkspaceOwner,
        createProject,
        updateProject,
        deleteProject,
    } = useProject();

    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Filter projects: owners see all, admins see only their admin projects
    const visibleProjects = isWorkspaceOwner
        ? projects
        : projects.filter((p) => projectRoles[p.id] === 'admin');

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            await createProject(newName.trim());
            setNewName('');
            notify.success(t('projects.createSuccess', 'Project created'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to create project';
            notify.error(msg);
        } finally {
            setCreating(false);
        }
    };

    const handleRename = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await updateProject(id, editName.trim());
            setEditingId(null);
            notify.success(t('projects.updateSuccess', 'Project updated'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to rename project';
            notify.error(msg);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteProject(id);
            setDeletingId(null);
            notify.success(t('projects.deleteSuccess', 'Project deleted'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to delete project';
            notify.error(msg);
        }
    };

    const startEdit = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    return (
        <Container>
            <HeaderRow>
                <div>
                    <PageTitle>{t('settings.projects.title', 'Projects')}</PageTitle>
                    <PageDescription>
                        {t('settings.projects.description', 'Manage projects in this workspace.')}
                    </PageDescription>
                </div>
            </HeaderRow>

            {/* Create new project — owners only */}
            {isWorkspaceOwner && (
                <CreateRow>
                    <CreateInput
                        type="text"
                        placeholder={t('projects.namePlaceholder', 'Project name')}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <CreateButton onClick={handleCreate} disabled={creating || !newName.trim()}>
                        <Plus size={15} />
                        {t('settings.projects.createButton', 'New project')}
                    </CreateButton>
                </CreateRow>
            )}

            {/* Project list */}
            <ProjectGrid>
                {visibleProjects.map((project) => {
                    const isEditing = editingId === project.id;
                    const isDeleting = deletingId === project.id;
                    const userRole = projectRoles[project.id];
                    const canDelete = isWorkspaceOwner && !project.is_default;

                    return (
                        <ProjectCard key={project.id}>
                            <ProjectCardLeft>
                                <ProjectIcon>
                                    <Grid3X3 size={16} color="hsl(var(--primary))" />
                                </ProjectIcon>
                                <ProjectInfo>
                                    {isEditing ? (
                                        <EditRow>
                                            <EditInput
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename(project.id);
                                                    if (e.key === 'Escape') setEditingId(null);
                                                }}
                                                autoFocus
                                            />
                                            <IconBtn onClick={() => handleRename(project.id)}>
                                                <Check size={14} color="hsl(var(--primary))" />
                                            </IconBtn>
                                            <IconBtn onClick={() => setEditingId(null)}>
                                                <X size={14} />
                                            </IconBtn>
                                        </EditRow>
                                    ) : (
                                        <ProjectNameRow>
                                            <ProjectName>{project.name}</ProjectName>
                                            {project.is_default && (
                                                <Badge $variant="default">
                                                    {t('projects.default', 'Default')}
                                                </Badge>
                                            )}
                                            {!isWorkspaceOwner && userRole && (
                                                <Badge $variant="role">
                                                    {t(`projects.roles.${userRole}`, userRole)}
                                                </Badge>
                                            )}
                                        </ProjectNameRow>
                                    )}
                                </ProjectInfo>
                            </ProjectCardLeft>

                            {!isEditing && !isDeleting && (
                                <ProjectActions>
                                    <IconBtn
                                        onClick={() => startEdit(project.id, project.name)}
                                        title={t('projects.rename', 'Rename')}
                                    >
                                        <Pencil size={14} />
                                    </IconBtn>
                                    {canDelete && (
                                        <IconBtn
                                            $destructive
                                            onClick={() => setDeletingId(project.id)}
                                            title={t('projects.delete.title', 'Delete project')}
                                        >
                                            <Trash2 size={14} />
                                        </IconBtn>
                                    )}
                                </ProjectActions>
                            )}

                            {isDeleting && (
                                <DeleteConfirm>
                                    <DeleteText>
                                        {t(
                                            'projects.delete.confirm',
                                            'Delete this project? Resources will be moved to the default project.',
                                        )}
                                    </DeleteText>
                                    <DeleteActions>
                                        <DeleteBtn onClick={() => handleDelete(project.id)}>
                                            {t('projects.delete.title', 'Delete')}
                                        </DeleteBtn>
                                        <CancelBtn onClick={() => setDeletingId(null)}>
                                            {t('common.cancel', 'Cancel')}
                                        </CancelBtn>
                                    </DeleteActions>
                                </DeleteConfirm>
                            )}
                        </ProjectCard>
                    );
                })}

                {visibleProjects.length === 0 && (
                    <EmptyText>{t('projects.noProjects', 'No projects yet.')}</EmptyText>
                )}
            </ProjectGrid>
        </Container>
    );
};

export default WorkspaceProjectsTab;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
`;

const PageTitle = styled.h2`
    font-size: 18px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px 0;
`;

const PageDescription = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const CreateRow = styled.div`
    display: flex;
    gap: 10px;
    align-items: center;
`;

const CreateInput = styled.input`
    flex: 1;
    max-width: 320px;
    padding: 9px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-family: inherit;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const CreateButton = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 8px;
    color: hsl(var(--primary-foreground));
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 150ms ease;
    white-space: nowrap;

    &:hover:not(:disabled) {
        filter: brightness(0.9);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const ProjectGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ProjectCard = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    transition: border-color 150ms ease;

    &:hover {
        border-color: var(--overlay-strong);
    }
`;

const ProjectCardLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 0;
`;

const ProjectIcon = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: hsla(var(--primary) / 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ProjectInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
`;

const ProjectNameRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ProjectName = styled.span`
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--foreground));
`;

const Badge = styled.span<{ $variant: 'default' | 'role' }>`
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 500;
    background: ${({ $variant }) =>
        $variant === 'default'
            ? 'hsla(var(--primary) / 0.12)'
            : 'hsla(var(--warning) / 0.12)'};
    color: ${({ $variant }) =>
        $variant === 'default'
            ? 'hsl(var(--primary))'
            : 'hsl(var(--warning))'};
`;

const ProjectActions = styled.div`
    display: flex;
    gap: 4px;
    flex-shrink: 0;
`;

const IconBtn = styled.button<{ $destructive?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 150ms ease;

    &:hover {
        background: ${({ $destructive }) =>
            $destructive
                ? 'hsla(var(--destructive) / 0.1)'
                : 'var(--overlay-light)'};
        color: ${({ $destructive }) =>
            $destructive
                ? 'hsl(var(--destructive))'
                : 'hsl(var(--foreground))'};
    }
`;

const EditRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const EditInput = styled.input`
    padding: 5px 10px;
    background: var(--overlay-subtle);
    border: 1px solid hsl(var(--primary));
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-family: inherit;
    width: 200px;

    &:focus {
        outline: none;
    }
`;

const DeleteConfirm = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
`;

const DeleteText = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    max-width: 200px;
`;

const DeleteActions = styled.div`
    display: flex;
    gap: 6px;
`;

const DeleteBtn = styled.button`
    padding: 5px 12px;
    background: hsl(var(--destructive));
    border: none;
    border-radius: 6px;
    color: hsl(var(--destructive-foreground));
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;

    &:hover {
        filter: brightness(0.9);
    }
`;

const CancelBtn = styled.button`
    padding: 5px 12px;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;

    &:hover {
        background: var(--overlay-subtle);
    }
`;

const EmptyText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    padding: 32px 0;
    margin: 0;
`;
