import { useCallback, useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronDown, Trash2 } from 'lucide-react';

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
    type WorkspaceInvitation,
    type WorkspaceMember,
} from '../../../services/members';
import InviteMemberModal from './invite-modal';

const WorkspaceUsersTab = () => {
    const { t } = useTranslation();
    const { selectedWorkspaceId, currentWorkspace } = useWorkspace();
    const { projects } = useProject();
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [roleDropdownId, setRoleDropdownId] = useState<string | null>(null);
    const [confirmRoleChange, setConfirmRoleChange] = useState<{
        member: WorkspaceMember;
        newIsOwner: boolean;
    } | null>(null);
    const roleDropdownRef = useRef<HTMLDivElement>(null);

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

    // Close role dropdown on outside click
    useEffect(() => {
        if (!roleDropdownId) return;
        const handleClick = (e: MouseEvent) => {
            if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
                setRoleDropdownId(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [roleDropdownId]);

    const handleInvite = async (data: {
        email: string;
        is_owner: boolean;
        project_assignments: { project_id: string; role: string }[];
    }) => {
        if (!selectedWorkspaceId) return;
        try {
            await addMember(selectedWorkspaceId, {
                email: data.email,
                is_owner: data.is_owner,
                project_assignments: data.project_assignments,
            });
            notify.success(t('settings.workspaces.users.memberAdded', 'Member added'));
            setShowInviteModal(false);
            await refreshMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to add member');
        }
    };

    const handleConfirmRoleChange = async () => {
        if (!selectedWorkspaceId || !confirmRoleChange) return;
        try {
            await updateMemberOwnership(selectedWorkspaceId, confirmRoleChange.member.id, {
                is_owner: confirmRoleChange.newIsOwner,
            });
            notify.success(t('settings.workspaces.users.roleUpdated', 'Workspace access updated'));
            setConfirmRoleChange(null);
            await refreshMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to update role');
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
                t('settings.workspaces.users.invitationCancelled', 'Invitation cancelled'),
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
            <SectionCard>
                <SectionHeader>
                    <SectionTitle>
                        {t('settings.workspaces.users.members', 'Members')} ({members.length})
                    </SectionTitle>
                    {canManage && (
                        <AddButton onClick={() => setShowInviteModal(true)}>
                            <Plus size={14} />
                            {t('settings.workspaces.users.addMember', 'Add member')}
                        </AddButton>
                    )}
                </SectionHeader>
                {members.length === 0 ? (
                    <StatusText>
                        {t('settings.workspaces.users.noMembers', 'No members yet.')}
                    </StatusText>
                ) : (
                    <Table>
                        <thead>
                            <tr>
                                <th>{t('settings.workspaces.users.name', 'Name')}</th>
                                <th>{t('settings.workspaces.users.email', 'Email')}</th>
                                <th>{t('settings.workspaces.users.role', 'Role')}</th>
                                {canManage && (
                                    <th style={{ textAlign: 'right' }}>
                                        {t('settings.workspaces.users.actions', '')}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((member) => (
                                <tr key={member.id}>
                                    <td>{member.name || member.email}</td>
                                    <td>
                                        <EmailCell>{member.email}</EmailCell>
                                    </td>
                                    <td>
                                        {canManage ? (
                                            <RoleDropdownWrap ref={roleDropdownId === member.id ? roleDropdownRef : undefined}>
                                                <RoleDropdownTrigger
                                                    onClick={() =>
                                                        setRoleDropdownId(
                                                            roleDropdownId === member.id ? null : member.id,
                                                        )
                                                    }
                                                >
                                                    <RoleBadge $isOwner={member.is_owner}>
                                                        {formatWorkspaceAccessLabel(member)}
                                                    </RoleBadge>
                                                    <ChevronDown size={12} />
                                                </RoleDropdownTrigger>
                                                {roleDropdownId === member.id && (
                                                    <RoleDropdownMenu>
                                                        <RoleDropdownItem
                                                            $active={member.is_owner}
                                                            onClick={() => {
                                                                if (!member.is_owner) {
                                                                    setConfirmRoleChange({
                                                                        member,
                                                                        newIsOwner: true,
                                                                    });
                                                                }
                                                                setRoleDropdownId(null);
                                                            }}
                                                        >
                                                            <RoleDropdownLabel>
                                                                {t('settings.workspaces.users.owner', 'Owner')}
                                                            </RoleDropdownLabel>
                                                            <RoleDropdownDesc>
                                                                {t('settings.workspaces.users.ownerDesc', 'Full access to workspace and all projects')}
                                                            </RoleDropdownDesc>
                                                        </RoleDropdownItem>
                                                        <RoleDropdownItem
                                                            $active={!member.is_owner}
                                                            onClick={() => {
                                                                if (member.is_owner) {
                                                                    setConfirmRoleChange({
                                                                        member,
                                                                        newIsOwner: false,
                                                                    });
                                                                }
                                                                setRoleDropdownId(null);
                                                            }}
                                                        >
                                                            <RoleDropdownLabel>
                                                                {t('settings.workspaces.users.member', 'Member')}
                                                            </RoleDropdownLabel>
                                                            <RoleDropdownDesc>
                                                                {t('settings.workspaces.users.memberDesc', 'Access based on project-level role assignments')}
                                                            </RoleDropdownDesc>
                                                        </RoleDropdownItem>
                                                    </RoleDropdownMenu>
                                                )}
                                            </RoleDropdownWrap>
                                        ) : (
                                            <RoleBadge $isOwner={member.is_owner}>
                                                {formatWorkspaceAccessLabel(member)}
                                            </RoleBadge>
                                        )}
                                    </td>
                                    {canManage && (
                                        <td>
                                            <ActionsCell>
                                                <RemoveButton
                                                    onClick={() => void handleRemove(member)}
                                                    title={t('settings.workspaces.users.remove', 'Remove')}
                                                >
                                                    <Trash2 size={14} />
                                                </RemoveButton>
                                            </ActionsCell>
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
                                {canManage && (
                                    <th style={{ textAlign: 'right' }}>
                                        {t('settings.workspaces.users.actions', '')}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {invitations.map((invitation) => (
                                <tr key={invitation.id}>
                                    <td>{invitation.email}</td>
                                    <td>
                                        <RoleBadge $isOwner={invitation.is_owner}>
                                            {formatWorkspaceAccessLabel(invitation)}
                                        </RoleBadge>
                                    </td>
                                    <td>
                                        {invitation.project_assignments.length > 0
                                            ? invitation.project_assignments
                                                  .map((assignment) => {
                                                      const project = projects.find(
                                                          (item) => item.id === assignment.project_id,
                                                      );
                                                      return `${project?.name ?? assignment.project_id} (${assignment.role})`;
                                                  })
                                                  .join(', ')
                                            : t('settings.workspaces.users.allProjects', 'All projects')}
                                    </td>
                                    {canManage && (
                                        <td>
                                            <ActionsCell>
                                                <RemoveButton
                                                    onClick={() =>
                                                        void handleCancelInvitation(invitation.id)
                                                    }
                                                    title={t('settings.workspaces.users.cancel', 'Cancel')}
                                                >
                                                    <Trash2 size={14} />
                                                </RemoveButton>
                                            </ActionsCell>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </SectionCard>
            )}

            {showInviteModal && (
                <InviteMemberModal
                    onSubmit={handleInvite}
                    onClose={() => setShowInviteModal(false)}
                />
            )}

            {confirmRoleChange && (
                <ConfirmBackdrop onClick={() => setConfirmRoleChange(null)}>
                    <ConfirmDialog onClick={(e) => e.stopPropagation()}>
                        <ConfirmTitle>
                            {t('settings.workspaces.users.confirmRoleTitle', 'Change role')}
                        </ConfirmTitle>
                        <ConfirmMessage>
                            {confirmRoleChange.newIsOwner
                                ? t(
                                      'settings.workspaces.users.confirmPromoteMessage',
                                      'Promote {{name}} to Owner? They will have full access to the workspace.',
                                      { name: confirmRoleChange.member.name || confirmRoleChange.member.email },
                                  )
                                : t(
                                      'settings.workspaces.users.confirmDemoteMessage',
                                      'Change {{name}} to Member? They will lose workspace management permissions.',
                                      { name: confirmRoleChange.member.name || confirmRoleChange.member.email },
                                  )}
                        </ConfirmMessage>
                        <ConfirmActions>
                            <ConfirmCancel onClick={() => setConfirmRoleChange(null)}>
                                {t('common.cancel', 'Cancel')}
                            </ConfirmCancel>
                            <ConfirmSubmit onClick={() => void handleConfirmRoleChange()}>
                                {t('settings.workspaces.users.confirmChange', 'Confirm')}
                            </ConfirmSubmit>
                        </ConfirmActions>
                    </ConfirmDialog>
                </ConfirmBackdrop>
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

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
`;

const SectionTitle = styled.h4`
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin: 0;
`;

const AddButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 7px;
    border: none;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 150ms ease;

    &:hover {
        opacity: 0.9;
    }
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;

    th,
    td {
        padding: 10px 8px;
        text-align: left;
        border-bottom: 1px solid var(--border-subtle);
        vertical-align: middle;
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

    tbody tr:last-child td {
        border-bottom: none;
    }
`;

const EmailCell = styled.span`
    color: hsl(var(--muted-foreground));
`;

const RoleBadge = styled.span<{ $isOwner: boolean }>`
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: ${({ $isOwner }) =>
        $isOwner ? 'hsla(var(--warning) / 0.12)' : 'hsla(var(--primary) / 0.1)'};
    color: ${({ $isOwner }) =>
        $isOwner ? 'hsl(var(--warning))' : 'hsl(var(--primary))'};
`;

const RoleDropdownWrap = styled.div`
    position: relative;
    display: inline-flex;
`;

const RoleDropdownTrigger = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    border-radius: 6px;
    transition: background 150ms ease;

    &:hover {
        background: var(--overlay-light);
    }
`;

const RoleDropdownMenu = styled.div`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 50;
    min-width: 260px;
    background: hsl(var(--card));
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    overflow: hidden;
`;

const RoleDropdownItem = styled.button<{ $active: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 12px 14px;
    border: none;
    background: ${({ $active }) => ($active ? 'hsla(var(--primary) / 0.06)' : 'transparent')};
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: background 150ms ease;

    &:hover {
        background: ${({ $active }) =>
            $active ? 'hsla(var(--primary) / 0.08)' : 'var(--overlay-light)'};
    }

    & + & {
        border-top: 1px solid var(--border-subtle);
    }
`;

const RoleDropdownLabel = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const RoleDropdownDesc = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
`;

const ActionsCell = styled.div`
    display: flex;
    justify-content: flex-end;
`;

const RemoveButton = styled.button`
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
    transition: background 150ms ease, color 150ms ease;

    &:hover {
        background: hsla(var(--destructive) / 0.18);
        color: hsl(var(--destructive));
    }
`;

const StatusText = styled.p`
    margin: 0;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
`;

// Confirmation dialog
const ConfirmBackdrop = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
    backdrop-filter: blur(2px);
`;

const ConfirmDialog = styled.div`
    background: hsl(var(--card));
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 24px;
    width: 380px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
`;

const ConfirmTitle = styled.h4`
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const ConfirmMessage = styled.p`
    margin: 0 0 20px;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
`;

const ConfirmActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

const ConfirmCancel = styled.button`
    padding: 8px 16px;
    border-radius: 7px;
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;

    &:hover {
        background: var(--overlay-light);
    }
`;

const ConfirmSubmit = styled.button`
    padding: 8px 18px;
    border-radius: 7px;
    border: none;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;

    &:hover {
        opacity: 0.9;
    }
`;
