import { useState } from 'react';
import styled from 'styled-components';
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../hooks/use-project';
import { notify } from '../toast/notify';

interface ProjectManagerProps {
    onClose: () => void;
}

const ProjectManager = ({ onClose }: ProjectManagerProps) => {
    const { t } = useTranslation();
    const { projects, createProject, updateProject, deleteProject } = useProject();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

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

    const handleDelete = async (id: string) => {
        try {
            await deleteProject(id);
            setDeletingId(null);
            notify.success(t('projects.deleteSuccess'));
        } catch {
            notify.error(t('projects.deleteError'));
        }
    };

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
                                ) : deletingId === project.id ? (
                                    <DeleteConfirm>
                                        <span>{t('projects.delete.confirm')}</span>
                                        <ConfirmActions>
                                            <DangerButton onClick={() => handleDelete(project.id)}>
                                                {t('common.delete')}
                                            </DangerButton>
                                            <CancelButton onClick={() => setDeletingId(null)}>
                                                {t('common.cancel')}
                                            </CancelButton>
                                        </ConfirmActions>
                                    </DeleteConfirm>
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
                                        {!project.is_default && (
                                            <ProjectActions>
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
                                                    onClick={() => setDeletingId(project.id)}
                                                    title={t('common.delete')}
                                                >
                                                    <Trash2 size={14} />
                                                </IconButton>
                                            </ProjectActions>
                                        )}
                                    </>
                                )}
                            </ProjectRow>
                        ))}
                    </ProjectList>
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

const DeleteConfirm = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
`;

const ConfirmActions = styled.div`
    display: flex;
    gap: 0.5rem;
`;

const DangerButton = styled.button`
    padding: 0.25rem 0.625rem;
    border: none;
    border-radius: 0.375rem;
    background: hsl(0 84% 60%);
    color: white;
    font-size: 0.8rem;
    cursor: pointer;
    &:hover {
        opacity: 0.9;
    }
`;

const CancelButton = styled.button`
    padding: 0.25rem 0.625rem;
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
