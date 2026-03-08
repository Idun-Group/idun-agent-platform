import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { ArrowLeft, UserPlus, Trash2, Loader, Shield, ShieldCheck, Eye } from 'lucide-react';
import {
    listProjectMembers,
    addProjectMember,
    updateProjectMemberRole,
    removeProjectMember,
    listWorkspaceMembers,
} from '../../services/members';
import type {
    ProjectMemberRead,
    ProjectRole,
    MemberRead,
} from '../../services/members';
import { notify } from '../toast/notify';

interface ProjectMembersPanelProps {
    projectId: string;
    projectName: string;
    workspaceId: string;
    onBack: () => void;
}

const ROLE_OPTIONS: { value: ProjectRole; label: string; icon: typeof Shield }[] = [
    { value: 'admin', label: 'Admin', icon: ShieldCheck },
    { value: 'contributor', label: 'Contributor', icon: Shield },
    { value: 'reader', label: 'Reader', icon: Eye },
];

const ProjectMembersPanel = ({ projectId, projectName, workspaceId, onBack }: ProjectMembersPanelProps) => {
    const [members, setMembers] = useState<ProjectMemberRead[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);

    // Add member form state
    const [workspaceMembers, setWorkspaceMembers] = useState<MemberRead[]>([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedRole, setSelectedRole] = useState<ProjectRole>('reader');
    const [isAdding, setIsAdding] = useState(false);

    const loadMembers = useCallback(async () => {
        try {
            const data = await listProjectMembers(projectId);
            setMembers(data.members);
        } catch (err) {
            console.error('Failed to load project members', err);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadMembers();
    }, [loadMembers]);

    const handleShowAddForm = async () => {
        try {
            const wsMembers = await listWorkspaceMembers(workspaceId);
            // Filter out users already in this project
            const existingUserIds = new Set(members.map(m => m.user_id));
            setWorkspaceMembers(wsMembers.members.filter(m => !existingUserIds.has(m.user_id)));
            setShowAddForm(true);
        } catch {
            notify.error('Failed to load workspace members');
        }
    };

    const handleAddMember = async () => {
        if (!selectedUserId) return;
        setIsAdding(true);
        try {
            await addProjectMember(projectId, { user_id: selectedUserId, role: selectedRole });
            setShowAddForm(false);
            setSelectedUserId('');
            setSelectedRole('reader');
            notify.success('Member added');
            await loadMembers();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to add member';
            notify.error(msg);
        } finally {
            setIsAdding(false);
        }
    };

    const handleRoleChange = async (member: ProjectMemberRead, newRole: ProjectRole) => {
        try {
            await updateProjectMemberRole(projectId, member.id, { role: newRole });
            notify.success(`Updated ${member.email} to ${newRole}`);
            await loadMembers();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to update role';
            notify.error(msg);
        }
    };

    const handleRemove = async (member: ProjectMemberRead) => {
        if (!window.confirm(`Remove ${member.email} from this project?`)) return;
        try {
            await removeProjectMember(projectId, member.id);
            notify.success(`Removed ${member.email}`);
            await loadMembers();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to remove member';
            notify.error(msg);
        }
    };

    return (
        <Container>
            <PanelHeader>
                <BackButton onClick={onBack}>
                    <ArrowLeft size={16} />
                </BackButton>
                <HeaderText>
                    <PanelTitle>{projectName}</PanelTitle>
                    <MemberCount>{members.length} member{members.length !== 1 ? 's' : ''}</MemberCount>
                </HeaderText>
                <AddButton onClick={handleShowAddForm}>
                    <UserPlus size={14} />
                    Add
                </AddButton>
            </PanelHeader>

            {showAddForm && (
                <AddForm>
                    <FormRow>
                        <Select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                        >
                            <option value="">Select workspace member...</option>
                            {workspaceMembers.map(m => (
                                <option key={m.user_id} value={m.user_id}>
                                    {m.name || m.email}
                                </option>
                            ))}
                        </Select>
                        <RoleSelect
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value as ProjectRole)}
                        >
                            {ROLE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </RoleSelect>
                    </FormRow>
                    <FormActions>
                        <CancelBtn onClick={() => setShowAddForm(false)}>Cancel</CancelBtn>
                        <ConfirmBtn onClick={handleAddMember} disabled={!selectedUserId || isAdding}>
                            {isAdding ? <Loader size={12} className="spin" /> : <UserPlus size={12} />}
                            Add Member
                        </ConfirmBtn>
                    </FormActions>
                </AddForm>
            )}

            {isLoading ? (
                <LoadingState>
                    <Loader size={20} className="spin" />
                </LoadingState>
            ) : members.length === 0 ? (
                <EmptyState>No members in this project</EmptyState>
            ) : (
                <MemberList>
                    {members.map(member => (
                        <MemberRow key={member.id}>
                            <MemberInfo>
                                <Avatar>
                                    {member.picture_url ? (
                                        <img src={member.picture_url} alt="" />
                                    ) : (
                                        <AvatarFallback>
                                            {(member.name || member.email).charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    )}
                                </Avatar>
                                <MemberDetails>
                                    <MemberName>
                                        {member.name || member.email}
                                        {member.is_workspace_owner && (
                                            <OwnerBadge>Owner</OwnerBadge>
                                        )}
                                    </MemberName>
                                    <MemberEmail>{member.email}</MemberEmail>
                                </MemberDetails>
                            </MemberInfo>
                            <MemberActions>
                                <RoleSelect
                                    value={member.role}
                                    onChange={(e) => handleRoleChange(member, e.target.value as ProjectRole)}
                                    disabled={member.is_workspace_owner}
                                    title={member.is_workspace_owner ? 'Workspace owners are always admin' : ''}
                                >
                                    {ROLE_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </RoleSelect>
                                {!member.is_workspace_owner && (
                                    <RemoveButton onClick={() => handleRemove(member)} title="Remove">
                                        <Trash2 size={14} />
                                    </RemoveButton>
                                )}
                            </MemberActions>
                        </MemberRow>
                    ))}
                </MemberList>
            )}
        </Container>
    );
};

export default ProjectMembersPanel;

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const PanelHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 0.625rem;
`;

const BackButton = styled.button`
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

const HeaderText = styled.div`
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
`;

const PanelTitle = styled.h3`
    font-size: 0.95rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const MemberCount = styled.span`
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
`;

const AddButton = styled.button`
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.625rem;
    border: none;
    border-radius: 0.375rem;
    background: hsl(var(--app-purple));
    color: white;
    font-size: 0.8rem;
    cursor: pointer;
    &:hover {
        opacity: 0.9;
    }
`;

const AddForm = styled.div`
    padding: 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    background: hsl(var(--accent) / 0.5);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const FormRow = styled.div`
    display: flex;
    gap: 0.5rem;
`;

const Select = styled.select`
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.8rem;
    &:focus {
        outline: none;
        border-color: hsl(var(--app-purple));
    }
`;

const RoleSelect = styled.select`
    padding: 0.375rem 0.5rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.75rem;
    &:focus {
        outline: none;
        border-color: hsl(var(--app-purple));
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const FormActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
`;

const CancelBtn = styled.button`
    padding: 0.375rem 0.625rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    background: none;
    color: hsl(var(--foreground));
    font-size: 0.8rem;
    cursor: pointer;
    &:hover { background: hsl(var(--accent)); }
`;

const ConfirmBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.625rem;
    border: none;
    border-radius: 0.375rem;
    background: hsl(var(--app-purple));
    color: white;
    font-size: 0.8rem;
    cursor: pointer;
    &:hover:not(:disabled) { opacity: 0.9; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const LoadingState = styled.div`
    display: flex;
    justify-content: center;
    padding: 2rem;
    color: hsl(var(--muted-foreground));
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 2rem;
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
`;

const MemberList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
`;

const MemberRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.625rem;
    border-radius: 0.5rem;
    &:hover {
        background: hsl(var(--accent));
    }
`;

const MemberInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex: 1;
`;

const Avatar = styled.div`
    width: 28px;
    height: 28px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
`;

const AvatarFallback = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--app-purple) / 0.2);
    color: hsl(var(--app-purple));
    font-size: 0.75rem;
    font-weight: 600;
`;

const MemberDetails = styled.div`
    min-width: 0;
`;

const MemberName = styled.div`
    font-size: 0.8rem;
    font-weight: 500;
    color: hsl(var(--foreground));
    display: flex;
    align-items: center;
    gap: 0.375rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const MemberEmail = styled.div`
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const OwnerBadge = styled.span`
    font-size: 0.65rem;
    padding: 0.0625rem 0.3rem;
    border-radius: 0.25rem;
    background: hsl(45 93% 47% / 0.15);
    color: hsl(45 93% 47%);
    font-weight: 600;
    flex-shrink: 0;
`;

const MemberActions = styled.div`
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
`;

const RemoveButton = styled.button`
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    &:hover {
        color: hsl(0 84% 60%);
        background: hsl(0 84% 60% / 0.1);
    }
`;
