import { useState } from 'react';
import styled from 'styled-components';
import { X, Plus, Pencil, Trash2, Check, AlertTriangle, ArrowRightLeft, Loader, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../hooks/use-project';
import type { ProjectDeleteInfo } from '../../hooks/use-project';
import { notify } from '../toast/notify';
import ProjectMembersPanel from './project-members-panel';

interface ProjectManagerProps {
    onClose: () => void;
}

const ProjectManager = ({ onClose }: ProjectManagerProps) => {
    const { t } = useTranslation();
    const { projects, createProject, updateProject, getDeleteInfo, confirmDelete } = useProject();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Members panel state
    const [membersProject, setMembersProject] = useState<{ id: string; name: string; workspaceId: string } | null>(null);

    // Two-step deletion state
    const [deleteInfo, setDeleteInfo] = useState<ProjectDeleteInfo | null>(null);
    const [deleteAction, setDeleteAction] = useState<'move' | 'delete_resources'>('move');
    const [moveTargetId, setMoveTargetId] = useState<string>('');
    const [isLoadingDelete, setIsLoadingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setIsCreating(true);
        try {
            await createProject(newName.trim());
            setNewName('');
            notify.success(t('projects.createSuccess'));
        } catch {
            notify.error(t('projects.createError'));
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await updateProject(id, editName.trim());
            setEditingId(null);
            notify.success(t('projects.updateSuccess'));
        } catch {
            notify.error(t('projects.updateError'));
        }
    };

    const handleDeleteClick = async (id: string) => {
        setIsLoadingDelete(true);
        try {
            const info = await getDeleteInfo(id);
            setDeleteInfo(info);
            // Pre-select a move target (first non-deleting project)
            const otherProjects = projects.filter(p => p.id !== id);
            const defaultTarget = otherProjects.find(p => p.is_default) ?? otherProjects[0];
            setMoveTargetId(defaultTarget?.id ?? '');
            setDeleteAction(info.total_resources > 0 ? 'move' : 'delete_resources');
        } catch {
            notify.error(t('projects.deleteError'));
        } finally {
            setIsLoadingDelete(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteInfo) return;
        if (deleteAction === 'move' && !moveTargetId) {
            notify.error('Select a target project for resource migration');
            return;
        }
        setIsDeleting(true);
        try {
            await confirmDelete(
                deleteInfo.project_id,
                deleteAction,
                deleteAction === 'move' ? moveTargetId : undefined,
            );
            setDeleteInfo(null);
            notify.success(t('projects.deleteSuccess'));
        } catch {
            notify.error(t('projects.deleteError'));
        } finally {
            setIsDeleting(false);
        }
    };

    const otherProjects = deleteInfo
        ? projects.filter(p => p.id !== deleteInfo.project_id)
        : [];

    return (
        <Overlay onClick={onClose}>
            <Modal onClick={(e) => e.stopPropagation()}>
                <ModalHeader>
                    <ModalTitle>{t('projects.manage')}</ModalTitle>
                    <CloseButton onClick={onClose}>
                        <X size={18} />
                    </CloseButton>
                </ModalHeader>

                <ModalBody>
                    {membersProject ? (
                        <ProjectMembersPanel
                            projectId={membersProject.id}
                            projectName={membersProject.name}
                            workspaceId={membersProject.workspaceId}
                            onBack={() => setMembersProject(null)}
                        />
                    ) : deleteInfo ? (
                        <DeleteDialog>
                            <DeleteWarning>
                                <AlertTriangle size={20} />
                                <span>
                                    Delete <strong>{deleteInfo.project_name}</strong>
                                </span>
                            </DeleteWarning>

                            {deleteInfo.total_resources > 0 ? (
                                <>
                                    <ResourceSummary>
                                        This project contains <strong>{deleteInfo.total_resources}</strong> resource{deleteInfo.total_resources !== 1 ? 's' : ''}:
                                        <ResourceList>
                                            {Object.entries(deleteInfo.resource_counts)
                                                .filter(([, count]) => count > 0)
                                                .map(([type, count]) => (
                                                    <ResourceItem key={type}>
                                                        <span>{type}</span>
                                                        <ResourceCount>{count}</ResourceCount>
                                                    </ResourceItem>
                                                ))}
                                        </ResourceList>
                                    </ResourceSummary>

                                    <ActionChoice>
                                        <ChoiceLabel>What should happen to these resources?</ChoiceLabel>
                                        <ChoiceOption
                                            $selected={deleteAction === 'move'}
                                            onClick={() => setDeleteAction('move')}
                                        >
                                            <ArrowRightLeft size={16} />
                                            <ChoiceText>
                                                <strong>Move to another project</strong>
                                                <span>Resources will be transferred to the selected project</span>
                                            </ChoiceText>
                                        </ChoiceOption>

                                        {deleteAction === 'move' && (
                                            <TargetSelect
                                                value={moveTargetId}
                                                onChange={(e) => setMoveTargetId(e.target.value)}
                                            >
                                                <option value="">Select target project...</option>
                                                {otherProjects.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name}{p.is_default ? ' (default)' : ''}
                                                    </option>
                                                ))}
                                            </TargetSelect>
                                        )}

                                        <ChoiceOption
                                            $selected={deleteAction === 'delete_resources'}
                                            onClick={() => setDeleteAction('delete_resources')}
                                        >
                                            <Trash2 size={16} />
                                            <ChoiceText>
                                                <strong>Delete all resources</strong>
                                                <span>All resources will be permanently removed</span>
                                            </ChoiceText>
                                        </ChoiceOption>
                                    </ActionChoice>
                                </>
                            ) : (
                                <ResourceSummary>
                                    This project has no resources and can be safely deleted.
                                </ResourceSummary>
                            )}

                            <DeleteDialogActions>
                                <CancelButton onClick={() => setDeleteInfo(null)}>
                                    Cancel
                                </CancelButton>
                                <DangerButton onClick={handleConfirmDelete} disabled={isDeleting}>
                                    {isDeleting ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                                    Delete Project
                                </DangerButton>
                            </DeleteDialogActions>
                        </DeleteDialog>
                    ) : (
                        <>
                            <CreateRow>
                                <Input
                                    type="text"
                                    placeholder={t('projects.namePlaceholder')}
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    disabled={isCreating}
                                />
                                <ActionButton onClick={handleCreate} disabled={isCreating || !newName.trim()}>
                                    <Plus size={16} />
                                    {t('projects.create')}
                                </ActionButton>
                            </CreateRow>

                            <ProjectList>
                                {projects.map((project) => (
                                    <ProjectRow key={project.id}>
                                        {editingId === project.id ? (
                                            <EditRow>
                                                <Input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleUpdate(project.id);
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                    autoFocus
                                                />
                                                <IconButton onClick={() => handleUpdate(project.id)} title="Save">
                                                    <Check size={16} />
                                                </IconButton>
                                                <IconButton onClick={() => setEditingId(null)} title="Cancel">
                                                    <X size={16} />
                                                </IconButton>
                                            </EditRow>
                                        ) : (
                                            <>
                                                <ProjectInfo>
                                                    <ProjectName>
                                                        {project.name}
                                                        {project.is_default && (
                                                            <DefaultBadge>{t('projects.default')}</DefaultBadge>
                                                        )}
                                                    </ProjectName>
                                                </ProjectInfo>
                                                <ProjectActions>
                                                    <IconButton
                                                        onClick={() => setMembersProject({
                                                            id: project.id,
                                                            name: project.name,
                                                            workspaceId: project.workspace_id,
                                                        })}
                                                        title="Members"
                                                    >
                                                        <Users size={14} />
                                                    </IconButton>
                                                    {!project.is_default && (
                                                        <>
                                                            <IconButton
                                                                onClick={() => {
                                                                    setEditingId(project.id);
                                                                    setEditName(project.name);
                                                                }}
                                                                title={t('common.edit')}
                                                            >
                                                                <Pencil size={14} />
                                                            </IconButton>
                                                            <IconButton
                                                                onClick={() => handleDeleteClick(project.id)}
                                                                disabled={isLoadingDelete}
                                                                title={t('common.delete')}
                                                            >
                                                                {isLoadingDelete ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                                                            </IconButton>
                                                        </>
                                                    )}
                                                </ProjectActions>
                                            </>
                                        )}
                                    </ProjectRow>
                                ))}
                            </ProjectList>
                        </>
                    )}
                </ModalBody>
            </Modal>
        </Overlay>
    );
};

export default ProjectManager;

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
`;

const Modal = styled.div`
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 0.75rem;
    width: 500px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const ModalHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid hsl(var(--border));
`;

const ModalTitle = styled.h2`
    font-size: 1.125rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    &:hover {
        color: hsl(var(--foreground));
        background: hsl(var(--accent));
    }
`;

const ModalBody = styled.div`
    padding: 1.25rem;
    overflow-y: auto;
`;

const CreateRow = styled.div`
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
`;

const Input = styled.input`
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.875rem;
    &:focus {
        outline: none;
        border-color: hsl(var(--app-purple));
        box-shadow: 0 0 0 2px hsl(var(--app-purple) / 0.2);
    }
    &:disabled {
        opacity: 0.5;
    }
`;

const ActionButton = styled.button`
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 0.5rem;
    background: hsl(var(--app-purple));
    color: white;
    font-size: 0.875rem;
    cursor: pointer;
    white-space: nowrap;
    &:hover:not(:disabled) {
        opacity: 0.9;
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const ProjectList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
`;

const ProjectRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.75rem;
    border-radius: 0.5rem;
    &:hover {
        background: hsl(var(--accent));
    }
`;

const ProjectInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const ProjectName = styled.span`
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const DefaultBadge = styled.span`
    font-size: 0.7rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: hsl(var(--app-purple) / 0.15);
    color: hsl(var(--app-purple));
    font-weight: 500;
`;

const ProjectActions = styled.div`
    display: flex;
    gap: 0.25rem;
`;

const IconButton = styled.button`
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0.375rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    &:hover {
        color: hsl(var(--foreground));
        background: hsl(var(--accent));
    }
`;

const EditRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
`;

const DangerButton = styled.button`
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    border: none;
    border-radius: 0.375rem;
    background: hsl(0 84% 60%);
    color: white;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    &:hover:not(:disabled) {
        opacity: 0.9;
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const CancelButton = styled.button`
    padding: 0.5rem 0.875rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    background: none;
    color: hsl(var(--foreground));
    font-size: 0.8rem;
    cursor: pointer;
    &:hover {
        background: hsl(var(--accent));
    }
`;

const DeleteDialog = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const DeleteWarning = styled.div`
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: hsl(0 84% 60% / 0.1);
    border: 1px solid hsl(0 84% 60% / 0.2);
    color: hsl(0 84% 60%);
    font-size: 0.9rem;
    font-weight: 500;
`;

const ResourceSummary = styled.div`
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    line-height: 1.5;
`;

const ResourceList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
`;

const ResourceItem = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    background: hsl(var(--accent));
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
    text-transform: capitalize;
`;

const ResourceCount = styled.span`
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const ActionChoice = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const ChoiceLabel = styled.span`
    font-size: 0.8rem;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
`;

const ChoiceOption = styled.button<{ $selected: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid ${p => p.$selected ? 'hsl(var(--app-purple))' : 'hsl(var(--border))'};
    background: ${p => p.$selected ? 'hsl(var(--app-purple) / 0.08)' : 'transparent'};
    color: hsl(var(--foreground));
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    &:hover {
        border-color: hsl(var(--app-purple));
    }
    svg {
        margin-top: 0.125rem;
        flex-shrink: 0;
        color: ${p => p.$selected ? 'hsl(var(--app-purple))' : 'hsl(var(--muted-foreground))'};
    }
`;

const ChoiceText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    strong {
        font-size: 0.875rem;
    }
    span {
        font-size: 0.75rem;
        color: hsl(var(--muted-foreground));
    }
`;

const TargetSelect = styled.select`
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.875rem;
    margin-left: 1.75rem;
    &:focus {
        outline: none;
        border-color: hsl(var(--app-purple));
    }
`;

const DeleteDialogActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid hsl(var(--border));
`;
