import { useCallback, useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronDown, Trash2 } from 'lucide-react';

import { notify } from '../../toast/notify';
import { useProject } from '../../../hooks/use-project';
import useWorkspace from '../../../hooks/use-workspace';
import {
    addProjectMember,
    listProjectMembers,
    removeProjectMember,
    updateProjectMemberRole,
    type ProjectMember,
    type ProjectRole,
} from '../../../services/project-members';
import InviteProjectMemberModal from './invite-modal';

const ROLE_OPTIONS: ProjectRole[] = ['admin', 'contributor', 'reader'];

const ProjectMembersTab = () => {
    const { t } = useTranslation();
    const { isCurrentWorkspaceOwner } = useWorkspace();
    const { currentProject, canAdmin } = useProject();
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [roleDropdownId, setRoleDropdownId] = useState<string | null>(null);
    const [confirmRoleChange, setConfirmRoleChange] = useState<{
        member: ProjectMember;
        newRole: ProjectRole;
    } | null>(null);
    const roleDropdownRef = useRef<HTMLDivElement>(null);

    const loadMembers = useCallback(async () => {
        if (!currentProject) {
            setMembers([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const nextMembers = await listProjectMembers(currentProject.id);
            setMembers(nextMembers);
        } catch (error) {
            console.error(error);
            notify.error('Failed to load project members');
        } finally {
            setLoading(false);
        }
    }, [currentProject]);

    useEffect(() => {
        void loadMembers();
    }, [loadMembers]);

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

    const handleInvite = async (data: { email: string; role: ProjectRole }) => {
        if (!currentProject) return;
        try {
            await addProjectMember(currentProject.id, data);
            notify.success(t('settings.projects.memberAdded', 'Member added'));
            setShowInviteModal(false);
            await loadMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to add project member');
        }
    };

    const handleConfirmRoleChange = async () => {
        if (!currentProject || !confirmRoleChange) return;
        try {
            await updateProjectMemberRole(currentProject.id, confirmRoleChange.member.id, {
                role: confirmRoleChange.newRole,
            });
            notify.success(t('settings.projects.roleUpdated', 'Role updated'));
            setConfirmRoleChange(null);
            await loadMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to update role');
        }
    };

    const handleRemove = async (member: ProjectMember) => {
        if (!currentProject) return;
        try {
            await removeProjectMember(currentProject.id, member.id);
            notify.success(t('settings.projects.memberRemoved', 'Member removed'));
            await loadMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to remove member');
        }
    };

    const roleDescriptions: Record<ProjectRole, string> = {
        admin: t('settings.projects.roleDesc.admin', 'Full project control including member management'),
        contributor: t('settings.projects.roleDesc.contributor', 'Create and edit agents, resources, and prompts'),
        reader: t('settings.projects.roleDesc.reader', 'View-only access to project resources'),
    };

    return (
        <Container>
            <SectionCard>
                <SectionHeader>
                    <SectionTitle>
                        {t('settings.projects.membersList', 'Members')} ({members.length})
                    </SectionTitle>
                    {canAdmin && currentProject && (
                        <AddButton onClick={() => setShowInviteModal(true)}>
                            <Plus size={14} />
                            {t('settings.projects.addMember', 'Add member')}
                        </AddButton>
                    )}
                </SectionHeader>
                {loading ? (
                    <StatusText>{t('common.loading', 'Loading...')}</StatusText>
                ) : !currentProject ? (
                    <StatusText>
                        {t('settings.projects.noCurrentProject', 'Select a project first.')}
                    </StatusText>
                ) : members.length === 0 ? (
                    <StatusText>
                        {t('settings.projects.noMembers', 'No project members yet.')}
                    </StatusText>
                ) : (
                    <Table>
                        <thead>
                            <tr>
                                <th>{t('settings.workspaces.users.name', 'Name')}</th>
                                <th>{t('settings.workspaces.users.email', 'Email')}</th>
                                <th>{t('settings.workspaces.users.role', 'Role')}</th>
                                {canAdmin && (
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
                                        {canAdmin ? (
                                            <RoleDropdownWrap
                                                ref={
                                                    roleDropdownId === member.id
                                                        ? roleDropdownRef
                                                        : undefined
                                                }
                                            >
                                                <RoleDropdownTrigger
                                                    onClick={() =>
                                                        setRoleDropdownId(
                                                            roleDropdownId === member.id
                                                                ? null
                                                                : member.id,
                                                        )
                                                    }
                                                >
                                                    <RoleBadge $role={member.role}>
                                                        {member.role}
                                                    </RoleBadge>
                                                    <ChevronDown size={12} />
                                                </RoleDropdownTrigger>
                                                {roleDropdownId === member.id && (
                                                    <RoleDropdownMenu>
                                                        {ROLE_OPTIONS.map((option) => {
                                                            const disabled =
                                                                option === 'admin' &&
                                                                !isCurrentWorkspaceOwner;
                                                            return (
                                                                <RoleDropdownItem
                                                                    key={option}
                                                                    $active={member.role === option}
                                                                    $disabled={disabled}
                                                                    onClick={() => {
                                                                        if (disabled) return;
                                                                        if (member.role !== option) {
                                                                            setConfirmRoleChange({
                                                                                member,
                                                                                newRole: option,
                                                                            });
                                                                        }
                                                                        setRoleDropdownId(null);
                                                                    }}
                                                                >
                                                                    <RoleDropdownLabel>
                                                                        {option}
                                                                        {disabled && (
                                                                            <OwnerOnlyTag>
                                                                                {t('settings.projects.modal.ownerOnly', 'Owner only')}
                                                                            </OwnerOnlyTag>
                                                                        )}
                                                                    </RoleDropdownLabel>
                                                                    <RoleDropdownDesc>
                                                                        {roleDescriptions[option]}
                                                                    </RoleDropdownDesc>
                                                                </RoleDropdownItem>
                                                            );
                                                        })}
                                                    </RoleDropdownMenu>
                                                )}
                                            </RoleDropdownWrap>
                                        ) : (
                                            <RoleBadge $role={member.role}>
                                                {member.role}
                                            </RoleBadge>
                                        )}
                                    </td>
                                    {canAdmin && (
                                        <td>
                                            <ActionsCell>
                                                <RemoveButton
                                                    onClick={() => void handleRemove(member)}
                                                    title={t('common.remove', 'Remove')}
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

            {showInviteModal && currentProject && (
                <InviteProjectMemberModal
                    onSubmit={handleInvite}
                    onClose={() => setShowInviteModal(false)}
                    isWorkspaceOwner={isCurrentWorkspaceOwner}
                    existingMembers={members}
                />
            )}

            {confirmRoleChange && (
                <ConfirmBackdrop onClick={() => setConfirmRoleChange(null)}>
                    <ConfirmDialog onClick={(e) => e.stopPropagation()}>
                        <ConfirmTitle>
                            {t('settings.projects.confirmRoleTitle', 'Change role')}
                        </ConfirmTitle>
                        <ConfirmMessage>
                            {t(
                                'settings.projects.confirmRoleMessage',
                                'Change {{name}} to {{role}}?',
                                {
                                    name:
                                        confirmRoleChange.member.name ||
                                        confirmRoleChange.member.email,
                                    role: confirmRoleChange.newRole,
                                },
                            )}
                        </ConfirmMessage>
                        <ConfirmRoleDesc>
                            {roleDescriptions[confirmRoleChange.newRole]}
                        </ConfirmRoleDesc>
                        <ConfirmActions>
                            <ConfirmCancel onClick={() => setConfirmRoleChange(null)}>
                                {t('common.cancel', 'Cancel')}
                            </ConfirmCancel>
                            <ConfirmSubmit onClick={() => void handleConfirmRoleChange()}>
                                {t('settings.projects.confirmChange', 'Confirm')}
                            </ConfirmSubmit>
                        </ConfirmActions>
                    </ConfirmDialog>
                </ConfirmBackdrop>
            )}
        </Container>
    );
};

export default ProjectMembersTab;

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

const roleColor = (role: ProjectRole) => {
    switch (role) {
        case 'admin':
            return { bg: 'hsla(var(--warning) / 0.12)', fg: 'hsl(var(--warning))' };
        case 'contributor':
            return { bg: 'hsla(var(--primary) / 0.1)', fg: 'hsl(var(--primary))' };
        default:
            return { bg: 'hsla(var(--muted-foreground) / 0.12)', fg: 'hsl(var(--muted-foreground))' };
    }
};

const RoleBadge = styled.span<{ $role: ProjectRole }>`
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
    background: ${({ $role }) => roleColor($role).bg};
    color: ${({ $role }) => roleColor($role).fg};
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
    min-width: 280px;
    background: hsl(var(--card));
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    overflow: hidden;
`;

const RoleDropdownItem = styled.button<{ $active: boolean; $disabled: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 12px 14px;
    border: none;
    background: ${({ $active }) => ($active ? 'hsla(var(--primary) / 0.06)' : 'transparent')};
    cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
    opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
    text-align: left;
    font-family: inherit;
    transition: background 150ms ease;

    &:hover {
        background: ${({ $active, $disabled }) =>
            $disabled
                ? 'transparent'
                : $active
                  ? 'hsla(var(--primary) / 0.08)'
                  : 'var(--overlay-light)'};
    }

    & + & {
        border-top: 1px solid var(--border-subtle);
    }
`;

const RoleDropdownLabel = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: capitalize;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const OwnerOnlyTag = styled.span`
    font-size: 9px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    background: var(--overlay-light);
    padding: 1px 6px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
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
    margin: 0 0 4px;
    font-size: 13px;
    color: hsl(var(--foreground));
    line-height: 1.5;
`;

const ConfirmRoleDesc = styled.p`
    margin: 0 0 20px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
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
