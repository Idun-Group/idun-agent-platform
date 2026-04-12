import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { notify } from '../../toast/notify';
import DeleteConfirmModal from '../../applications/delete-confirm-modal/component';
import { createProject, deleteProject, listProjects, updateProject, type Project } from '../../../services/projects';
import useWorkspace from '../../../hooks/use-workspace';
import { useProject } from '../../../hooks/use-project';

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
                                            <ProjectName>
                                                {project.name}
                                                {project.is_default && <Badge>Default</Badge>}
                                            </ProjectName>
                                            <ProjectMeta>
                                                {project.current_user_role ?? 'no role'}
                                                {project.description ? ` • ${project.description}` : ''}
                                            </ProjectMeta>
                                        </>
                                    )}
                                </ProjectInfo>
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
                                            <DangerButton onClick={() => void handleRequestDelete(project)}>
                                                {t('common.delete', 'Delete')}
                                            </DangerButton>
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
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 8px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
`;

const ProjectInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
`;

const ProjectName = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const Badge = styled.span`
    padding: 2px 8px;
    border-radius: 999px;
    background: hsla(var(--primary) / 0.12);
    color: hsl(var(--primary));
    font-size: 12px;
    font-weight: 600;
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

const DangerButton = styled.button`
    border: none;
    background: transparent;
    color: hsl(var(--destructive));
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
`;
