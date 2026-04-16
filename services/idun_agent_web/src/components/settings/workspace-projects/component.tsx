import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Star, Trash2, Users } from 'lucide-react';

import { notify } from '../../toast/notify';
import DeleteConfirmModal from '../../applications/delete-confirm-modal/component';
import { createProject, deleteProject, listProjects, setDefaultProject, updateProject, type Project } from '../../../services/projects';
import useWorkspace from '../../../hooks/use-workspace';
import { useProject } from '../../../hooks/use-project';
import MembersPanel from './members-panel';

const WorkspaceProjectsTab = () => {
    const { t } = useTranslation();
    const { selectedWorkspaceId, isCurrentWorkspaceOwner } = useWorkspace();
    const { refreshProjects } = useProject();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingDescription, setEditingDescription] = useState('');
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [deleteDescription, setDeleteDescription] = useState<string | undefined>(undefined);
    const [membersProject, setMembersProject] = useState<Project | null>(null);

    const loadProjects = useCallback(async () => {
        if (!selectedWorkspaceId) {
            setProjects([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const projectData = await listProjects();
            setProjects(projectData);
        } catch (error) {
            console.error(error);
            notify.error('Failed to load projects');
        } finally {
            setLoading(false);
        }
    }, [selectedWorkspaceId]);

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    const handleCreate = async () => {
        if (!name.trim()) return;
        try {
            await createProject({ name: name.trim(), description: description.trim() || null });
            setName('');
            setDescription('');
            await loadProjects();
            await refreshProjects();
            notify.success(t('projects.created', 'Project created'));
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to create project');
        }
    };

    const handleStartEditing = (project: Project) => {
        setEditingProjectId(project.id);
        setEditingName(project.name);
        setEditingDescription(project.description ?? '');
    };

    const handleRename = async (project: Project) => {
        const nextName = editingName.trim();
        const nextDescription = editingDescription.trim() || null;
        if (!nextName) return;
        try {
            await updateProject(project.id, {
                name: nextName,
                description: nextDescription,
            });
            setEditingProjectId(null);
            setEditingName('');
            setEditingDescription('');
            await loadProjects();
            await refreshProjects();
            notify.success(t('projects.updated', 'Project updated'));
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to update project');
        }
    };

    const handleRequestDelete = (project: Project) => {
        if (project.is_default) return;
        setProjectToDelete(project);
        setDeleteDescription(
            'Deleting this project will remove all project-scoped resources associated with it.'
        );
    };

    const handleDeleteConfirm = async () => {
        if (!projectToDelete) return;
        const result = await deleteProject(projectToDelete.id);
        setProjectToDelete(null);
        setDeleteDescription(undefined);
        setEditingProjectId(null);
        await loadProjects();
        await refreshProjects();
        notify.success(
            t('projects.deleted', 'Project deleted') +
                (result.resource_count > 0 ? ` (${result.resource_count} resources)` : '')
        );
    };

    const handleSetDefault = async (project: Project) => {
        if (project.is_default) return;
        try {
            await setDefaultProject(project.id);
            await loadProjects();
            await refreshProjects();
            notify.success(
                t('settings.projects.defaultSet', '{{name}} is now the default project', {
                    name: project.name,
                }),
            );
        } catch (error) {
            console.error(error);
            notify.error(
                error instanceof Error ? error.message : 'Failed to set default project',
            );
        }
    };

    return (
        <Container>
            {isCurrentWorkspaceOwner && (
                <SectionCard>
                    <SectionTitle>{t('settings.projects.create', 'Create Project')}</SectionTitle>
                    <CreateRow>
                        <Input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={t('settings.projects.name', 'Project name')}
                        />
                        <Input
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder={t('settings.projects.descriptionField', 'Description')}
                        />
                        <PrimaryButton onClick={handleCreate}>
                            {t('settings.projects.create', 'Create')}
                        </PrimaryButton>
                    </CreateRow>
                </SectionCard>
            )}

            <SectionCard>
                <SectionTitle>
                    {t('settings.projects.list', 'Projects')} ({projects.length})
                </SectionTitle>
                {loading ? (
                    <StatusText>{t('common.loading', 'Loading...')}</StatusText>
                ) : projects.length === 0 ? (
                    <StatusText>{t('projects.empty', 'No projects available.')}</StatusText>
                ) : (
                    <List>
                        {projects.map((project) => (
                            <ProjectRow key={project.id}>
                                <StarButton
                                    $active={project.is_default}
                                    $clickable={isCurrentWorkspaceOwner && !project.is_default}
                                    onClick={() => {
                                        if (isCurrentWorkspaceOwner && !project.is_default) {
                                            void handleSetDefault(project);
                                        }
                                    }}
                                    title={
                                        project.is_default
                                            ? t('settings.projects.isDefault', 'Default project')
                                            : isCurrentWorkspaceOwner
                                              ? t('settings.projects.setDefault', 'Set as default')
                                              : ''
                                    }
                                >
                                    <Star
                                        size={16}
                                        fill={project.is_default ? 'currentColor' : 'none'}
                                    />
                                </StarButton>
                                <ProjectInfo>
                                    {editingProjectId === project.id ? (
                                        <EditStack>
                                            <Input
                                                value={editingName}
                                                onChange={(event) => setEditingName(event.target.value)}
                                                placeholder={t('settings.projects.name', 'Project name')}
                                            />
                                            <Input
                                                value={editingDescription}
                                                onChange={(event) => setEditingDescription(event.target.value)}
                                                placeholder={t('settings.projects.descriptionField', 'Description')}
                                            />
                                        </EditStack>
                                    ) : (
                                        <>
                                            <ProjectName>{project.name}</ProjectName>
                                            <ProjectMeta>
                                                {project.current_user_role ?? 'no role'}
                                                {project.description ? ` • ${project.description}` : ''}
                                            </ProjectMeta>
                                        </>
                                    )}
                                </ProjectInfo>
                                <MembersButton
                                    onClick={() => setMembersProject(project)}
                                    title={t('settings.projects.panel.members', 'Members')}
                                >
                                    <Users size={14} />
                                    {t('settings.projects.panel.members', 'Members')}
                                </MembersButton>
                                {(isCurrentWorkspaceOwner || project.current_user_role === 'admin') && (
                                    <ActionRow>
                                        {editingProjectId === project.id ? (
                                            <>
                                                <InlineButton onClick={() => void handleRename(project)}>
                                                    {t('common.save', 'Save')}
                                                </InlineButton>
                                                <InlineButton
                                                    onClick={() => {
                                                        setEditingProjectId(null);
                                                        setEditingName('');
                                                        setEditingDescription('');
                                                    }}
                                                >
                                                    {t('common.cancel', 'Cancel')}
                                                </InlineButton>
                                            </>
                                        ) : (
                                            <InlineButton onClick={() => handleStartEditing(project)}>
                                                {t('common.rename', 'Rename')}
                                            </InlineButton>
                                        )}
                                        {isCurrentWorkspaceOwner && !project.is_default && (
                                            <DeleteButton
                                                onClick={() => void handleRequestDelete(project)}
                                                title={t('common.delete', 'Delete')}
                                            >
                                                <Trash2 size={14} />
                                            </DeleteButton>
                                        )}
                                    </ActionRow>
                                )}
                            </ProjectRow>
                        ))}
                    </List>
                )}
            </SectionCard>

            <DeleteConfirmModal
                isOpen={!!projectToDelete}
                onClose={() => {
                    setProjectToDelete(null);
                    setDeleteDescription(undefined);
                }}
                onConfirm={handleDeleteConfirm}
                itemName={projectToDelete?.name ?? ''}
                description={deleteDescription}
            />

            {membersProject && (
                <MembersPanel
                    project={membersProject}
                    onClose={() => setMembersProject(null)}
                />
            )}
        </Container>
    );
};

export default WorkspaceProjectsTab;

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

const CreateRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
`;

const Input = styled.input`
    padding: 9px 12px;
    font-size: 13px;
    border-radius: 7px;
    border: 1px solid var(--border-subtle);
    background: var(--overlay-subtle);
    color: hsl(var(--foreground));

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.15);
    }
`;

const PrimaryButton = styled.button`
    padding: 9px 16px;
    border-radius: 7px;
    border: none;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
`;

const StatusText = styled.p`
    margin: 0;
    color: hsl(var(--muted-foreground));
    font-size: 14px;
`;

const List = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const ProjectRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 8px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
`;

const StarButton = styled.button<{ $active: boolean; $clickable: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    border-radius: 6px;
    flex-shrink: 0;
    cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
    color: ${({ $active }) =>
        $active ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))'};
    opacity: ${({ $active, $clickable }) => ($active ? 1 : $clickable ? 0.4 : 0.2)};
    transition: color 150ms ease, opacity 150ms ease, background 150ms ease;

    &:hover {
        opacity: ${({ $active, $clickable }) => ($active ? 1 : $clickable ? 0.8 : 0.2)};
        background: ${({ $clickable }) => ($clickable ? 'var(--overlay-light)' : 'transparent')};
    }
`;

const ProjectInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
`;

const ProjectName = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const ProjectMeta = styled.span`
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    text-transform: capitalize;
`;

const EditStack = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    min-width: 320px;
`;

const ActionRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const InlineButton = styled.button`
    border: none;
    background: transparent;
    color: hsl(var(--primary));
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
`;

const MembersButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 7px;
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    transition: background 150ms ease, border-color 150ms ease;

    &:hover {
        background: var(--overlay-light);
        border-color: hsl(var(--muted-foreground));
    }
`;

const DeleteButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    background: hsla(var(--destructive) / 0.08);
    color: hsl(var(--destructive));
    border-radius: 6px;
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
        background: hsla(var(--destructive) / 0.18);
    }
`;
