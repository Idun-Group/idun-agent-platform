import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { notify } from '../../toast/notify';
import useWorkspace from '../../../hooks/use-workspace';
import { useProject } from '../../../hooks/use-project';
import {
    addMember,
    cancelInvitation,
    formatWorkspaceAccessLabel,
    listMembers,
    removeMember,
    updateMemberOwnership,
    type ProjectAssignment,
    type ProjectRole,
    type WorkspaceInvitation,
    type WorkspaceMember,
} from '../../../services/members';

const PROJECT_ROLE_OPTIONS: ProjectRole[] = ['admin', 'contributor', 'reader'];

const WorkspaceUsersTab = () => {
    const { t } = useTranslation();
    const { selectedWorkspaceId, currentWorkspace } = useWorkspace();
    const { projects } = useProject();
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [isOwnerInvite, setIsOwnerInvite] = useState(false);
    const [projectAssignments, setProjectAssignments] = useState<ProjectAssignment[]>([]);

    const canManage = currentWorkspace?.is_owner ?? false;

    const refreshMembers = useCallback(async () => {
        if (!selectedWorkspaceId) {
            setMembers([]);
            setInvitations([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const response = await listMembers(selectedWorkspaceId);
            setMembers(response.members);
            setInvitations(response.invitations ?? []);
        } catch (error) {
            console.error(error);
            notify.error(t('settings.workspaces.users.fetchError', 'Failed to load members'));
        } finally {
            setLoading(false);
        }
    }, [selectedWorkspaceId, t]);

    useEffect(() => {
        void refreshMembers();
    }, [refreshMembers]);

    useEffect(() => {
        if (isOwnerInvite) {
            setProjectAssignments([]);
        }
    }, [isOwnerInvite]);

    const assignmentsByProjectId = useMemo(
        () => new Map(projectAssignments.map((assignment) => [assignment.project_id, assignment])),
        [projectAssignments],
    );

    const toggleProjectAssignment = (projectId: string) => {
        setProjectAssignments((current) => {
            const exists = current.some((assignment) => assignment.project_id === projectId);
            if (exists) {
                return current.filter((assignment) => assignment.project_id !== projectId);
            }
            return [...current, { project_id: projectId, role: 'reader' }];
        });
    };

    const updateAssignmentRole = (projectId: string, role: ProjectRole) => {
        setProjectAssignments((current) =>
            current.map((assignment) =>
                assignment.project_id === projectId ? { ...assignment, role } : assignment
            )
        );
    };

    const handleInvite = async () => {
        if (!selectedWorkspaceId || !email.trim()) return;
        try {
            await addMember(selectedWorkspaceId, {
                email: email.trim(),
                is_owner: isOwnerInvite,
                project_assignments: isOwnerInvite ? [] : projectAssignments,
            });
            setEmail('');
            setIsOwnerInvite(false);
            setProjectAssignments([]);
            notify.success(t('settings.workspaces.users.memberAdded', 'Member added'));
            await refreshMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to add member');
        }
    };

    const handleOwnershipToggle = async (member: WorkspaceMember) => {
        if (!selectedWorkspaceId) return;
        try {
            await updateMemberOwnership(selectedWorkspaceId, member.id, {
                is_owner: !member.is_owner,
            });
            notify.success(t('settings.workspaces.users.roleUpdated', 'Workspace access updated'));
            await refreshMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to update ownership');
        }
    };

    const handleRemove = async (member: WorkspaceMember) => {
        if (!selectedWorkspaceId) return;
        try {
            await removeMember(selectedWorkspaceId, member.id);
            notify.success(t('settings.workspaces.users.memberRemoved', 'Member removed'));
            await refreshMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to remove member');
        }
    };

    const handleCancelInvitation = async (invitationId: string) => {
        if (!selectedWorkspaceId) return;
        try {
            await cancelInvitation(selectedWorkspaceId, invitationId);
            notify.success(
                t('settings.workspaces.users.invitationCancelled', 'Invitation cancelled')
            );
            await refreshMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to cancel invitation');
        }
    };

    if (loading) {
        return <StatusText>{t('common.loading', 'Loading...')}</StatusText>;
    }

    return (
        <Container>
            {canManage && (
                <SectionCard>
                    <SectionTitle>
                        {t('settings.workspaces.users.title', 'Invite Member')}
                    </SectionTitle>
                    <InviteSection>
                        <Input
                            type="email"
                            placeholder={t('settings.workspaces.users.email', 'Email')}
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                        <CheckboxRow>
                            <input
                                id="invite-owner"
                                type="checkbox"
                                checked={isOwnerInvite}
                                onChange={(event) => setIsOwnerInvite(event.target.checked)}
                            />
                            <label htmlFor="invite-owner">
                                {t('settings.workspaces.users.ownerToggle', 'Invite as workspace owner')}
                            </label>
                        </CheckboxRow>

                        {!isOwnerInvite && projects.length > 0 && (
                            <AssignmentsSection>
                                <AssignmentsTitle>
                                    {t(
                                        'settings.workspaces.users.projectAssignments',
                                        'Initial project assignments',
                                    )}
                                </AssignmentsTitle>
                                {projects.map((project) => {
                                    const currentAssignment = assignmentsByProjectId.get(project.id);
                                    return (
                                        <AssignmentRow key={project.id}>
                                            <CheckboxRow>
                                                <input
                                                    id={`assignment-${project.id}`}
                                                    type="checkbox"
                                                    checked={!!currentAssignment}
                                                    onChange={() => toggleProjectAssignment(project.id)}
                                                />
                                                <label htmlFor={`assignment-${project.id}`}>
                                                    {project.name}
                                                </label>
                                            </CheckboxRow>
                                            <RoleSelect
                                                value={currentAssignment?.role ?? 'reader'}
                                                disabled={!currentAssignment}
                                                onChange={(event) =>
                                                    updateAssignmentRole(
                                                        project.id,
                                                        event.target.value as ProjectRole
                                                    )
                                                }
                                            >
                                                {PROJECT_ROLE_OPTIONS.map((role) => (
                                                    <option key={role} value={role}>
                                                        {role}
                                                    </option>
                                                ))}
                                            </RoleSelect>
                                        </AssignmentRow>
                                    );
                                })}
                            </AssignmentsSection>
                        )}

                        <PrimaryButton onClick={handleInvite}>
                            {t('settings.workspaces.users.addMember', 'Add member')}
                        </PrimaryButton>
                    </InviteSection>
                </SectionCard>
            )}

            <SectionCard>
                <SectionTitle>
                    {t('settings.workspaces.users.members', 'Members')} ({members.length})
                </SectionTitle>
                {members.length === 0 ? (
                    <StatusText>{t('settings.workspaces.users.noMembers', 'No members yet.')}</StatusText>
                ) : (
                    <Table>
                        <thead>
                            <tr>
                                <th>{t('settings.workspaces.users.name', 'Name')}</th>
                                <th>{t('settings.workspaces.users.email', 'Email')}</th>
                                <th>{t('settings.workspaces.users.role', 'Access')}</th>
                                {canManage && <th>{t('settings.workspaces.users.actions', 'Actions')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((member) => (
                                <tr key={member.id}>
                                    <td>{member.name || member.email}</td>
                                    <td>{member.email}</td>
                                    <td>{formatWorkspaceAccessLabel(member)}</td>
                                    {canManage && (
                                        <td>
                                            <ActionRow>
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={member.is_owner}
                                                        onChange={() => void handleOwnershipToggle(member)}
                                                    />
                                                    {t('settings.workspaces.users.owner', 'Owner')}
                                                </label>
                                                <InlineDangerButton
                                                    onClick={() => void handleRemove(member)}
                                                >
                                                    {t('settings.workspaces.users.remove', 'Remove')}
                                                </InlineDangerButton>
                                            </ActionRow>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </SectionCard>

            {invitations.length > 0 && (
                <SectionCard>
                    <SectionTitle>
                        {t('settings.workspaces.users.invitations', 'Pending Invitations')} ({invitations.length})
                    </SectionTitle>
                    <Table>
                        <thead>
                            <tr>
                                <th>{t('settings.workspaces.users.email', 'Email')}</th>
                                <th>{t('settings.workspaces.users.role', 'Access')}</th>
                                <th>{t('settings.workspaces.users.projects', 'Projects')}</th>
                                {canManage && <th>{t('settings.workspaces.users.actions', 'Actions')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {invitations.map((invitation) => (
                                <tr key={invitation.id}>
                                    <td>{invitation.email}</td>
                                    <td>{formatWorkspaceAccessLabel(invitation)}</td>
                                    <td>
                                        {invitation.project_assignments.length > 0
                                            ? invitation.project_assignments
                                                  .map((assignment) => {
                                                      const project = projects.find(
                                                          (item) => item.id === assignment.project_id
                                                      );
                                                      return `${project?.name ?? assignment.project_id} (${assignment.role})`;
                                                  })
                                                  .join(', ')
                                            : 'Default project'}
                                    </td>
                                    {canManage && (
                                        <td>
                                            <InlineDangerButton
                                                onClick={() => void handleCancelInvitation(invitation.id)}
                                            >
                                                {t('settings.workspaces.users.cancel', 'Cancel')}
                                            </InlineDangerButton>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </SectionCard>
            )}
        </Container>
    );
};

export default WorkspaceUsersTab;

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

const InviteSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const Input = styled.input`
    padding: 9px 12px;
    border-radius: 7px;
    border: 1px solid var(--border-subtle);
    background: var(--overlay-subtle);
    color: hsl(var(--foreground));
    font-size: 13px;
`;

const CheckboxRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: hsl(var(--foreground));
    font-size: 13px;
`;

const AssignmentsSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    background: hsl(var(--card));
    border: 1px solid var(--border-subtle);
`;

const AssignmentsTitle = styled.h4`
    margin: 0;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

const AssignmentRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const RoleSelect = styled.select`
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    color: hsl(var(--foreground));
`;

const PrimaryButton = styled.button`
    align-self: flex-start;
    padding: 9px 16px;
    border-radius: 7px;
    border: none;
    background: hsl(var(--primary));
    color: white;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;

    th,
    td {
        padding: 10px 8px;
        text-align: left;
        border-bottom: 1px solid var(--border-subtle);
        vertical-align: top;
    }

    th {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: hsl(var(--muted-foreground));
    }

    td {
        font-size: 13px;
        color: hsl(var(--foreground));
    }
`;

const ActionRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
`;

const InlineDangerButton = styled.button`
    border: none;
    background: transparent;
    color: hsl(var(--destructive));
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
`;

const StatusText = styled.p`
    margin: 0;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
`;
