import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from '../../toast/notify';
import styled, { keyframes } from 'styled-components';
import { Trash2, UserPlus, Check, X, Info } from 'lucide-react';
import useWorkspace from '../../../hooks/use-workspace';
import { useAuth } from '../../../hooks/use-auth';
import { getJson } from '../../../utils/api';
import {
    listMembers,
    addMember,
    removeMember,
    updateMember,
    cancelInvitation,
    WORKSPACE_ROLE_LABELS,
    WORKSPACE_ROLE_PERMISSIONS,
    type WorkspaceMember,
    type WorkspaceInvitation,
    type ProjectAssignment,
    type ProjectRole,
} from '../../../services/members';
import { useProject } from '../../../hooks/use-project';

// ===========================================================================
// Main component
// ===========================================================================

const WorkspaceUsersTab = () => {
    const { t } = useTranslation();
    const { selectedWorkspaceId } = useWorkspace();
    const { session } = useAuth();
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInvite, setShowInvite] = useState(false);

    const currentUserId = session?.principal?.user_id ?? '';
    const currentMember = members.find((m) => m.user_id === currentUserId);
    const canManage = currentMember?.is_owner === true;

    const resolveWorkspaceId = useCallback(async (): Promise<string | null> => {
        if (selectedWorkspaceId) return selectedWorkspaceId;
        try {
            const workspaces = await getJson<{ id: string }[]>('/api/v1/workspaces/');
            return workspaces[0]?.id ?? null;
        } catch {
            return null;
        }
    }, [selectedWorkspaceId]);

    const fetchMembers = useCallback(async () => {
        setLoading(true);
        try {
            const wsId = await resolveWorkspaceId();
            if (!wsId) return;
            const res = await listMembers(wsId);
            setMembers(res.members);
            setInvitations(res.invitations ?? []);
        } catch {
            notify.error(t('settings.workspaces.users.fetchError', 'Failed to load members'));
        } finally {
            setLoading(false);
        }
    }, [resolveWorkspaceId, t]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    const handleRemove = async (member: WorkspaceMember) => {
        const wsId = await resolveWorkspaceId();
        if (!wsId) return;
        try {
            await removeMember(wsId, member.id);
            notify.success(t('settings.workspaces.users.memberRemoved', 'Member removed'));
            fetchMembers();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to remove member';
            notify.error(msg);
        }
    };

    const handleInvite = async (
        email: string,
        isOwner: boolean,
        projectAssignments: ProjectAssignment[],
    ) => {
        const wsId = await resolveWorkspaceId();
        if (!wsId) return;
        try {
            await addMember(wsId, {
                email,
                is_owner: isOwner,
                project_assignments: isOwner ? [] : projectAssignments,
            });
            notify.success(t('settings.workspaces.users.memberAdded', 'Member added'));
            fetchMembers();
        } catch (err: unknown) {
            const raw = err instanceof Error ? err.message : '';
            // Parse backend JSON error to extract detail
            let detail = '';
            try {
                const parsed = JSON.parse(raw);
                detail = typeof parsed.detail === 'string' ? parsed.detail : '';
            } catch {
                detail = raw;
            }
            // Show friendly message for known errors
            if (detail.toLowerCase().includes('already a member')) {
                notify.error(t('settings.workspaces.users.alreadyInvited', 'This email has already been invited'));
            } else {
                notify.error(detail || t('settings.workspaces.users.addError', 'Failed to add member'));
            }
        }
    };

    const handleCancelInvitation = async (invitation: WorkspaceInvitation) => {
        const wsId = await resolveWorkspaceId();
        if (!wsId) return;
        try {
            await cancelInvitation(wsId, invitation.id);
            notify.success(t('settings.workspaces.users.invitationCancelled', 'Invitation cancelled'));
            fetchMembers();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to cancel invitation';
            notify.error(msg);
        }
    };

    const handleRoleChange = async (member: WorkspaceMember, isOwner: boolean) => {
        const wsId = await resolveWorkspaceId();
        if (!wsId) return;
        try {
            await updateMember(wsId, member.id, { is_owner: isOwner });
            notify.success(
                isOwner
                    ? t('settings.workspaces.users.promoted', 'Member promoted to Owner')
                    : t('settings.workspaces.users.demoted', 'Owner changed to Member'),
            );
            fetchMembers();
        } catch (err: unknown) {
            const raw = err instanceof Error ? err.message : '';
            let detail = '';
            try {
                const parsed = JSON.parse(raw);
                detail = typeof parsed.detail === 'string' ? parsed.detail : '';
            } catch {
                detail = raw;
            }
            notify.error(detail || t('settings.workspaces.users.roleChangeError', 'Failed to change role'));
        }
    };

    if (loading) {
        return <LoadingText>{t('common.loading', 'Loading...')}</LoadingText>;
    }

    return (
        <Container>
            {/* Header with invite button */}
            <HeaderRow>
                <div>
                    <PageTitle>
                        {t('settings.workspaces.users.title', 'Members')}
                    </PageTitle>
                    <PageDescription>
                        {t(
                            'settings.workspaces.users.description',
                            'Manage who has access to this workspace.',
                        )}
                    </PageDescription>
                </div>
                {canManage && (
                    <InviteButton onClick={() => setShowInvite(true)}>
                        <UserPlus size={15} />
                        {t('settings.workspaces.users.addMember', 'Add member')}
                    </InviteButton>
                )}
            </HeaderRow>

            {/* Members table */}
            <TableCard>
                <Table>
                    <thead>
                        <Tr>
                            <Th>{t('settings.workspaces.users.name', 'Name')}</Th>
                            <Th>{t('settings.workspaces.users.email', 'Email')}</Th>
                            <Th>{t('settings.workspaces.users.role', 'Role')}</Th>
                            {canManage && (
                                <Th style={{ width: 60, textAlign: 'right' }}>
                                    {t('settings.workspaces.users.actions', '')}
                                </Th>
                            )}
                        </Tr>
                    </thead>
                    <tbody>
                        {members.map((member) => (
                            <MemberRow
                                key={member.id}
                                member={member}
                                currentMember={currentMember}
                                canManage={canManage}
                                onRemove={handleRemove}
                                onRoleChange={handleRoleChange}
                            />
                        ))}
                        {invitations.map((inv) => (
                            <InvitationRow
                                key={`inv-${inv.id}`}
                                invitation={inv}
                                canManage={canManage}
                                onCancel={handleCancelInvitation}
                            />
                        ))}
                        {members.length === 0 && invitations.length === 0 && (
                            <Tr>
                                <Td colSpan={4}>
                                    <EmptyText>
                                        {t(
                                            'settings.workspaces.users.noMembers',
                                            'No members yet.',
                                        )}
                                    </EmptyText>
                                </Td>
                            </Tr>
                        )}
                    </tbody>
                </Table>
            </TableCard>

            {/* Invite dialog */}
            {showInvite && (
                <InviteMemberDialog
                    onInvite={handleInvite}
                    onClose={() => setShowInvite(false)}
                />
            )}
        </Container>
    );
};

export default WorkspaceUsersTab;

// ===========================================================================
// MemberRow sub-component
// ===========================================================================

type MemberRowProps = {
    member: WorkspaceMember;
    currentMember?: WorkspaceMember;
    canManage: boolean;
    onRemove: (member: WorkspaceMember) => void;
    onRoleChange: (member: WorkspaceMember, isOwner: boolean) => void;
};

const MemberRow = ({
    member,
    currentMember,
    canManage,
    onRemove,
    onRoleChange,
}: MemberRowProps) => {
    const { t } = useTranslation();
    const [showConfirm, setShowConfirm] = useState(false);
    const [showRoleConfirm, setShowRoleConfirm] = useState<boolean | null>(null);

    const canRemove =
        canManage &&
        !member.is_owner &&
        member.user_id !== currentMember?.user_id;

    const canChangeRole =
        canManage &&
        member.user_id !== currentMember?.user_id;

    const initials = (member.name ?? member.email ?? '?')
        .charAt(0)
        .toUpperCase();

    const handleRoleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newIsOwner = e.target.value === 'owner';
        if (newIsOwner === member.is_owner) return;
        setShowRoleConfirm(newIsOwner);
    };

    const confirmRoleChange = () => {
        if (showRoleConfirm !== null) {
            onRoleChange(member, showRoleConfirm);
            setShowRoleConfirm(null);
        }
    };

    return (
        <>
            <Tr>
                <Td>
                    <UserCell>
                        {member.picture_url ? (
                            <Avatar src={member.picture_url} alt="" />
                        ) : (
                            <AvatarFallback>{initials}</AvatarFallback>
                        )}
                        <UserName>{member.name || member.email}</UserName>
                    </UserCell>
                </Td>
                <Td>
                    <EmailText>{member.email}</EmailText>
                </Td>
                <Td>
                    {canChangeRole ? (
                        <WorkspaceRoleSelect
                            value={member.is_owner ? 'owner' : 'member'}
                            onChange={handleRoleSelect}
                        >
                            <option value="owner">{WORKSPACE_ROLE_LABELS.owner}</option>
                            <option value="member">{WORKSPACE_ROLE_LABELS.member}</option>
                        </WorkspaceRoleSelect>
                    ) : (
                        <RoleBadge $isOwner={member.is_owner}>
                            {member.is_owner
                                ? WORKSPACE_ROLE_LABELS.owner
                                : WORKSPACE_ROLE_LABELS.member}
                        </RoleBadge>
                    )}
                </Td>
                {canManage && (
                    <Td style={{ textAlign: 'right' }}>
                        {canRemove && (
                            <RemoveButton
                                onClick={() => setShowConfirm(true)}
                                title={t('settings.workspaces.users.remove', 'Remove')}
                            >
                                <Trash2 size={15} />
                            </RemoveButton>
                        )}
                    </Td>
                )}
            </Tr>
            {showConfirm && (
                <ConfirmDialog
                    title={t('settings.workspaces.users.confirmRemoveTitle', 'Remove member')}
                    message={t(
                        'settings.workspaces.users.confirmRemoveMessage',
                        'Are you sure you want to remove {{name}} from this workspace?',
                        { name: member.name || member.email },
                    )}
                    confirmLabel={t('settings.workspaces.users.confirmRemove', 'Remove')}
                    onConfirm={() => {
                        setShowConfirm(false);
                        onRemove(member);
                    }}
                    onCancel={() => setShowConfirm(false)}
                />
            )}
            {showRoleConfirm !== null && (
                <ConfirmDialog
                    title={
                        showRoleConfirm
                            ? t('settings.workspaces.users.promoteTitle', 'Promote to Owner?')
                            : t('settings.workspaces.users.demoteTitle', 'Change to Member?')
                    }
                    message={
                        showRoleConfirm
                            ? t(
                                  'settings.workspaces.users.promoteMessage',
                                  '{{name}} will get full admin access to all projects. Their project-specific roles will be removed.',
                                  { name: member.name || member.email },
                              )
                            : t(
                                  'settings.workspaces.users.demoteMessage',
                                  "{{name}} will lose owner privileges. They'll be assigned as admin on all existing projects to preserve access.",
                                  { name: member.name || member.email },
                              )
                    }
                    confirmLabel={
                        showRoleConfirm
                            ? t('settings.workspaces.users.promote', 'Promote to Owner')
                            : t('settings.workspaces.users.demote', 'Change to Member')
                    }
                    onConfirm={confirmRoleChange}
                    onCancel={() => setShowRoleConfirm(null)}
                />
            )}
        </>
    );
};

// ===========================================================================
// InvitationRow sub-component
// ===========================================================================

type InvitationRowProps = {
    invitation: WorkspaceInvitation;
    canManage: boolean;
    onCancel: (invitation: WorkspaceInvitation) => void;
};

const InvitationRow = ({ invitation, canManage, onCancel }: InvitationRowProps) => {
    const { t } = useTranslation();
    const initials = invitation.email.charAt(0).toUpperCase();

    return (
        <Tr>
            <Td>
                <UserCell>
                    <AvatarFallback style={{ opacity: 0.5 }}>{initials}</AvatarFallback>
                    <UserName style={{ opacity: 0.6 }}>{invitation.email}</UserName>
                </UserCell>
            </Td>
            <Td>
                <EmailText style={{ opacity: 0.6 }}>{invitation.email}</EmailText>
            </Td>
            <Td>
                <PendingBadge>
                    {t('settings.workspaces.users.pending', 'Pending')}
                </PendingBadge>
            </Td>
            {canManage && (
                <Td style={{ textAlign: 'right' }}>
                    <RemoveButton
                        onClick={() => onCancel(invitation)}
                        title={t('settings.workspaces.users.cancelInvitation', 'Cancel invitation')}
                    >
                        <X size={15} />
                    </RemoveButton>
                </Td>
            )}
        </Tr>
    );
};

// ===========================================================================
// InviteMemberDialog
// ===========================================================================

type InviteMemberDialogProps = {
    onInvite: (
        email: string,
        isOwner: boolean,
        projectAssignments: ProjectAssignment[],
    ) => Promise<void>;
    onClose: () => void;
};

const InviteMemberDialog = ({
    onInvite,
    onClose,
}: InviteMemberDialogProps) => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [hoveredRole, setHoveredRole] = useState<'owner' | 'member' | null>(null);

    const { projects } = useProject();
    const [assignments, setAssignments] = useState<Record<string, ProjectRole | null>>({});

    const toggleProject = (projectId: string) => {
        setAssignments((prev) => {
            const next = { ...prev };
            if (next[projectId]) {
                next[projectId] = null;
            } else {
                next[projectId] = 'contributor';
            }
            return next;
        });
    };

    const setProjectRole = (projectId: string, role: ProjectRole) => {
        setAssignments((prev) => ({ ...prev, [projectId]: role }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!email.trim()) {
            setError(t('settings.workspaces.users.emailRequired', 'Email is required'));
            return;
        }

        const projectAssignments: ProjectAssignment[] = Object.entries(assignments)
            .filter(([, role]) => role !== null)
            .map(([project_id, role]) => ({ project_id, role: role! }));

        setSubmitting(true);
        try {
            await onInvite(email.trim(), isOwner, projectAssignments);
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to add member';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Overlay onClick={onClose}>
            <Dialog onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>
                        {t('settings.workspaces.users.inviteTitle', 'Add new member')}
                    </DialogTitle>
                    <CloseButton onClick={onClose}>
                        <X size={18} />
                    </CloseButton>
                </DialogHeader>

                <DialogDescription>
                    {t(
                        'settings.workspaces.users.inviteDescription',
                        'Invite a user to this workspace by their email address. If they haven\'t signed up yet, they\'ll be added automatically when they do.',
                    )}
                </DialogDescription>

                <Form onSubmit={handleSubmit}>
                    <FieldGroup>
                        <FieldLabel>
                            {t('settings.workspaces.users.emailLabel', 'Email')}
                        </FieldLabel>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user@example.com"
                            autoFocus
                        />
                    </FieldGroup>

                    <FieldGroup>
                        <FieldLabel>
                            {t('settings.workspaces.users.roleLabel', 'Role')}
                        </FieldLabel>
                        <InviteRoleGrid>
                            <InviteRoleOption
                                $isSelected={isOwner}
                                type="button"
                                onClick={() => setIsOwner(true)}
                                onMouseEnter={() => setHoveredRole('owner')}
                                onMouseLeave={() => setHoveredRole(null)}
                            >
                                <InviteRoleName>{WORKSPACE_ROLE_LABELS.owner}</InviteRoleName>
                                <InviteRoleDesc>
                                    {WORKSPACE_ROLE_PERMISSIONS.owner[0]}
                                </InviteRoleDesc>

                                {hoveredRole === 'owner' && (
                                    <InviteRoleTooltip>
                                        <TooltipTitle>{WORKSPACE_ROLE_LABELS.owner}</TooltipTitle>
                                        <TooltipPermissions>
                                            {WORKSPACE_ROLE_PERMISSIONS.owner.map((perm) => (
                                                <PermissionItem key={perm}>
                                                    <Check size={12} color="hsl(var(--primary))" />
                                                    {perm}
                                                </PermissionItem>
                                            ))}
                                        </TooltipPermissions>
                                    </InviteRoleTooltip>
                                )}
                            </InviteRoleOption>

                            <InviteRoleOption
                                $isSelected={!isOwner}
                                type="button"
                                onClick={() => setIsOwner(false)}
                                onMouseEnter={() => setHoveredRole('member')}
                                onMouseLeave={() => setHoveredRole(null)}
                            >
                                <InviteRoleName>{WORKSPACE_ROLE_LABELS.member}</InviteRoleName>
                                <InviteRoleDesc>
                                    {WORKSPACE_ROLE_PERMISSIONS.member[0]}
                                </InviteRoleDesc>

                                {hoveredRole === 'member' && (
                                    <InviteRoleTooltip>
                                        <TooltipTitle>{WORKSPACE_ROLE_LABELS.member}</TooltipTitle>
                                        <TooltipPermissions>
                                            {WORKSPACE_ROLE_PERMISSIONS.member.map((perm) => (
                                                <PermissionItem key={perm}>
                                                    <Check size={12} color="hsl(var(--primary))" />
                                                    {perm}
                                                </PermissionItem>
                                            ))}
                                        </TooltipPermissions>
                                    </InviteRoleTooltip>
                                )}
                            </InviteRoleOption>
                        </InviteRoleGrid>
                    </FieldGroup>

                    {/* Project assignment section */}
                    {!isOwner ? (
                        <FieldGroup>
                            <FieldLabel>
                                {t('settings.projects.projectAccess', 'Project access')}
                            </FieldLabel>
                            <ProjectAccessList>
                                {projects.map((project) => {
                                    const assigned = !!assignments[project.id];
                                    return (
                                        <ProjectAccessRow
                                            key={project.id}
                                            $assigned={assigned}
                                        >
                                            <ProjectCheckArea onClick={() => toggleProject(project.id)}>
                                                <ProjectCheckbox $checked={assigned}>
                                                    {assigned && (
                                                        <Check size={11} color="hsl(var(--primary))" />
                                                    )}
                                                </ProjectCheckbox>
                                                <ProjectAccessName $assigned={assigned}>
                                                    {project.name}
                                                </ProjectAccessName>
                                                {project.is_default && (
                                                    <ProjectDefaultBadge>
                                                        {t('projects.default', 'Default')}
                                                    </ProjectDefaultBadge>
                                                )}
                                            </ProjectCheckArea>
                                            {assigned ? (
                                                <RoleSelect
                                                    value={assignments[project.id] ?? 'contributor'}
                                                    onChange={(e) =>
                                                        setProjectRole(
                                                            project.id,
                                                            e.target.value as ProjectRole,
                                                        )
                                                    }
                                                >
                                                    <option value="admin">
                                                        {t('projects.roles.admin', 'Admin')}
                                                    </option>
                                                    <option value="contributor">
                                                        {t('projects.roles.contributor', 'Contributor')}
                                                    </option>
                                                    <option value="reader">
                                                        {t('projects.roles.reader', 'Reader')}
                                                    </option>
                                                </RoleSelect>
                                            ) : (
                                                <RoleDash>—</RoleDash>
                                            )}
                                        </ProjectAccessRow>
                                    );
                                })}
                            </ProjectAccessList>
                            <ProjectAccessHelp>
                                {t(
                                    'settings.projects.projectAccessHelp',
                                    'Select which projects this member can access and their role in each.',
                                )}
                            </ProjectAccessHelp>
                        </FieldGroup>
                    ) : (
                        <OwnerInfoBox>
                            <InfoIcon>
                                <Info size={16} color="hsl(var(--primary))" />
                            </InfoIcon>
                            <OwnerInfoText>
                                {t(
                                    'settings.projects.ownerInfo',
                                    'Workspace owners have admin access to all projects by default. No project assignment needed.',
                                )}
                            </OwnerInfoText>
                        </OwnerInfoBox>
                    )}

                    {error && <ErrorText>{error}</ErrorText>}

                    <DialogActions>
                        <CancelButton type="button" onClick={onClose}>
                            {t('common.cancel', 'Cancel')}
                        </CancelButton>
                        <SubmitButton type="submit" disabled={submitting}>
                            {submitting
                                ? t('common.adding', 'Adding...')
                                : t('settings.workspaces.users.grantAccess', 'Grant access')}
                        </SubmitButton>
                    </DialogActions>
                </Form>
            </Dialog>
        </Overlay>
    );
};

// ===========================================================================
// ConfirmDialog
// ===========================================================================

type ConfirmDialogProps = {
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
};

const ConfirmDialog = ({
    title,
    message,
    confirmLabel,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) => {
    const { t } = useTranslation();
    return (
        <Overlay onClick={onCancel}>
            <Dialog onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <DialogDescription>{message}</DialogDescription>
                <DialogActions>
                    <CancelButton type="button" onClick={onCancel}>
                        {t('common.cancel', 'Cancel')}
                    </CancelButton>
                    <DestructiveButton onClick={onConfirm}>
                        {confirmLabel}
                    </DestructiveButton>
                </DialogActions>
            </Dialog>
        </Overlay>
    );
};

// ===========================================================================
// Styled components
// ===========================================================================

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

const InviteButton = styled.button`
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

    &:hover {
        filter: brightness(0.9);
    }
`;

const TableCard = styled.div`
    border: 1px solid var(--border-subtle);
    border-radius: 10px;

    /* Allow dropdowns to escape while keeping rounded corners on the table header */
    thead tr:first-child th:first-child {
        border-top-left-radius: 10px;
    }
    thead tr:first-child th:last-child {
        border-top-right-radius: 10px;
    }
    tbody tr:last-child td:first-child {
        border-bottom-left-radius: 10px;
    }
    tbody tr:last-child td:last-child {
        border-bottom-right-radius: 10px;
    }
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
`;

const Tr = styled.tr`
    border-bottom: 1px solid var(--border-subtle);

    &:last-child {
        border-bottom: none;
    }
`;

const Th = styled.th`
    text-align: left;
    padding: 12px 16px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
    background: var(--overlay-subtle);
`;

const Td = styled.td`
    padding: 12px 16px;
    font-size: 14px;
    color: hsl(var(--foreground));
    vertical-align: middle;
`;

const UserCell = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const Avatar = styled.img`
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
`;

const AvatarFallback = styled.div`
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: hsla(var(--primary) / 0.2);
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
`;

const UserName = styled.span`
    font-weight: 500;
    color: hsl(var(--foreground));
`;

const EmailText = styled.span`
    color: hsl(var(--muted-foreground));
`;

const RoleBadge = styled.span<{ $isOwner: boolean }>`
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    background: ${({ $isOwner }) =>
        $isOwner
            ? 'hsla(var(--warning) / 0.12)'
            : 'rgba(59, 130, 246, 0.12)'};
    color: ${({ $isOwner }) =>
        $isOwner
            ? 'hsl(var(--warning))'
            : '#60a5fa'};
`;

const WorkspaceRoleSelect = styled.select`
    padding: 5px 28px 5px 10px;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--overlay-subtle);
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23826F95' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    option {
        background: hsl(var(--popover));
        color: hsl(var(--foreground));
    }
`;

const PendingBadge = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    background: hsla(var(--muted-foreground) / 0.12);
    color: hsl(var(--muted-foreground));
`;

const RemoveButton = styled.button`
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
    margin-left: auto;

    &:hover {
        background: hsla(var(--destructive) / 0.1);
        color: hsl(var(--destructive));
    }
`;

const TooltipTitle = styled.div`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: 10px;
`;

const TooltipPermissions = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const PermissionItem = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
`;

// Dialog styles
const fadeIn = keyframes`
    from { opacity: 0; }
    to { opacity: 1; }
`;

const slideUp = keyframes`
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
`;

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--overlay-backdrop);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: ${fadeIn} 150ms ease;
`;

const Dialog = styled.div`
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 500px;
    margin: 16px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    animation: ${slideUp} 200ms ease;
`;

const DialogHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
`;

const DialogTitle = styled.h3`
    font-size: 18px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const CloseButton = styled.button`
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
        background: var(--overlay-light);
        color: hsl(var(--foreground));
    }
`;

const DialogDescription = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0 0 20px 0;
    line-height: 1.5;
`;

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const FieldGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const FieldLabel = styled.label`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
`;

const Input = styled.input`
    padding: 10px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-family: inherit;
    transition: border-color 150ms ease;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const InviteRoleGrid = styled.div`
    display: flex;
    gap: 8px;
`;

const InviteRoleOption = styled.button<{ $isSelected?: boolean }>`
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border: 1px solid
        ${({ $isSelected }) =>
            $isSelected ? 'hsl(var(--primary))' : 'var(--border-light)'};
    border-radius: 8px;
    background: ${({ $isSelected }) =>
        $isSelected ? 'hsla(var(--primary) / 0.08)' : 'var(--overlay-subtle)'};
    color: hsl(var(--foreground));
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms ease;

    &:hover {
        border-color: ${({ $isSelected }) =>
            $isSelected ? 'hsl(var(--primary))' : 'var(--overlay-strong)'};
        background: ${({ $isSelected }) =>
            $isSelected ? 'hsla(var(--primary) / 0.08)' : 'var(--overlay-subtle)'};
    }
`;

const InviteRoleName = styled.span`
    font-size: 14px;
    font-weight: 600;
`;

const InviteRoleDesc = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

const InviteRoleTooltip = styled.div`
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: 220px;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    z-index: 51;
`;

const ErrorText = styled.p`
    font-size: 13px;
    color: hsl(var(--destructive));
    margin: 0;
`;

const DialogActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
`;

const CancelButton = styled.button`
    padding: 9px 16px;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms ease;

    &:hover {
        background: var(--overlay-subtle);
    }
`;

const SubmitButton = styled.button`
    padding: 9px 16px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 8px;
    color: hsl(var(--primary-foreground));
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms ease;

    &:hover:not(:disabled) {
        filter: brightness(0.9);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const DestructiveButton = styled.button`
    padding: 9px 16px;
    background: hsl(var(--destructive));
    border: none;
    border-radius: 8px;
    color: hsl(var(--destructive-foreground));
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms ease;

    &:hover {
        filter: brightness(0.9);
    }
`;

const LoadingText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    padding: 24px 0;
`;

const EmptyText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    padding: 24px 0;
    margin: 0;
`;

// Project assignment styles
const ProjectAccessList = styled.div`
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
`;

const ProjectAccessRow = styled.div<{ $assigned: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: ${({ $assigned }) =>
        $assigned ? 'hsla(var(--primary) / 0.04)' : 'transparent'};

    & + & {
        border-top: 1px solid var(--border-subtle);
    }
`;

const ProjectCheckArea = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    flex: 1;
`;

const ProjectCheckbox = styled.div<{ $checked: boolean }>`
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1.5px solid ${({ $checked }) =>
        $checked ? 'hsl(var(--primary))' : 'var(--border-light)'};
    background: ${({ $checked }) =>
        $checked ? 'hsla(var(--primary) / 0.15)' : 'transparent'};
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms ease;
    flex-shrink: 0;
`;

const ProjectAccessName = styled.span<{ $assigned: boolean }>`
    font-size: 13px;
    font-weight: ${({ $assigned }) => ($assigned ? '500' : '400')};
    color: ${({ $assigned }) =>
        $assigned ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'};
`;

const ProjectDefaultBadge = styled.span`
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: hsla(var(--primary) / 0.12);
    color: hsl(var(--primary));
    font-weight: 500;
`;

const RoleSelect = styled.select`
    padding: 4px 10px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--muted-foreground));
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    appearance: none;
    padding-right: 24px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23826F95' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    option {
        background: hsl(var(--popover));
        color: hsl(var(--foreground));
    }
`;

const RoleDash = styled.span`
    color: hsl(var(--muted-foreground) / 0.3);
    font-size: 12px;
    padding: 4px 10px;
`;

const ProjectAccessHelp = styled.p`
    margin: 6px 0 0;
    font-size: 12px;
    color: hsl(var(--muted-foreground) / 0.6);
    line-height: 1.4;
`;

const OwnerInfoBox = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 16px;
    background: hsla(var(--primary) / 0.05);
    border: 1px solid hsla(var(--primary) / 0.12);
    border-radius: 8px;
`;

const InfoIcon = styled.span`
    flex-shrink: 0;
    margin-top: 1px;
    display: flex;
`;

const OwnerInfoText = styled.span`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
`;
