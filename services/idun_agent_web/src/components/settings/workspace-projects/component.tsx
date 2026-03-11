import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Plus, Pencil, Trash2, Check, X, Grid3X3, Users, ChevronDown } from 'lucide-react';
import { notify } from '../../toast/notify';
import { useProject, type ProjectRole } from '../../../hooks/use-project';
import { useAuth } from '../../../hooks/use-auth';
import { getJson, patchJson, deleteRequest } from '../../../utils/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectMember = {
    id: string;
    user_id: string;
    role: ProjectRole;
    email: string;
    name?: string | null;
    picture_url?: string | null;
    is_workspace_owner?: boolean;
};

const ROLE_LEVEL: Record<ProjectRole, number> = {
    admin: 3,
    contributor: 2,
    reader: 1,
};

// Workspace owners are effectively above admin
const OWNER_LEVEL = 4;

function getMyLevel(isWorkspaceOwner: boolean, projectRole?: ProjectRole): number {
    if (isWorkspaceOwner) return OWNER_LEVEL;
    if (projectRole) return ROLE_LEVEL[projectRole];
    return 0;
}

function canModifyMember(
    myLevel: number,
    member: ProjectMember,
): boolean {
    // Can never modify workspace owners (implicit admins)
    if (member.is_workspace_owner) return false;
    // Can only modify members with strictly lower role
    return myLevel > ROLE_LEVEL[member.role];
}

function getAssignableRoles(myLevel: number): ProjectRole[] {
    return (['admin', 'contributor', 'reader'] as ProjectRole[]).filter(
        (r) => ROLE_LEVEL[r] < myLevel,
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const WorkspaceProjectsTab = () => {
    const { t } = useTranslation();
    const { session } = useAuth();
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
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [projectMembers, setProjectMembers] = useState<Record<string, ProjectMember[]>>({});

    const currentUserId = session?.principal?.user_id ?? '';

    // Filter projects: owners see all, admins see only their admin projects
    const visibleProjects = isWorkspaceOwner
        ? projects
        : projects.filter((p) => projectRoles[p.id] === 'admin');

    const fetchProjectMembers = useCallback(async (projectList: typeof projects) => {
        const membersByProject: Record<string, ProjectMember[]> = {};
        await Promise.all(
            projectList.map(async (p) => {
                try {
                    const res = await getJson<{ members: ProjectMember[]; total: number }>(
                        `/api/v1/projects/${p.id}/members`,
                    );
                    membersByProject[p.id] = res.members;
                } catch {
                    membersByProject[p.id] = [];
                }
            }),
        );
        setProjectMembers(membersByProject);
    }, []);

    // Re-fetch members when projects change
    const projectIds = visibleProjects.map((p) => p.id).join(',');
    useEffect(() => {
        if (visibleProjects.length > 0) {
            fetchProjectMembers(visibleProjects);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectIds]);

    const refreshSingleProject = useCallback(async (projectId: string) => {
        try {
            const res = await getJson<{ members: ProjectMember[]; total: number }>(
                `/api/v1/projects/${projectId}/members`,
            );
            setProjectMembers((prev) => ({ ...prev, [projectId]: res.members }));
        } catch {
            // keep existing data on error
        }
    }, []);

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
            if (expandedId === id) setExpandedId(null);
            notify.success(t('projects.deleteSuccess', 'Project deleted'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to delete project';
            notify.error(msg);
        }
    };

    const handleUpdateRole = async (projectId: string, membershipId: string, role: ProjectRole) => {
        try {
            await patchJson(`/api/v1/projects/${projectId}/members/${membershipId}`, { role });
            await refreshSingleProject(projectId);
            notify.success(t('projects.members.roleUpdated', 'Role updated'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to update role';
            notify.error(msg);
        }
    };

    const handleRemoveMember = async (projectId: string, membershipId: string) => {
        try {
            await deleteRequest(`/api/v1/projects/${projectId}/members/${membershipId}`);
            await refreshSingleProject(projectId);
            notify.success(t('projects.members.removed', 'Member removed from project'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to remove member';
            notify.error(msg);
        }
    };

    const startEdit = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    const toggleExpand = (id: string) => {
        setExpandedId((prev) => (prev === id ? null : id));
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
                    const isExpanded = expandedId === project.id;
                    const members = projectMembers[project.id] ?? [];
                    const memberCount = members.filter((m) => !m.is_workspace_owner).length;
                    const myLevel = getMyLevel(isWorkspaceOwner, userRole);

                    return (
                        <ProjectCardWrapper key={project.id}>
                            <ProjectCard
                                $expanded={isExpanded}
                                onClick={() => {
                                    if (!isEditing && !isDeleting) toggleExpand(project.id);
                                }}
                            >
                                <ProjectCardLeft>
                                    <ProjectIcon>
                                        <Grid3X3 size={16} color="hsl(var(--primary))" />
                                    </ProjectIcon>
                                    <ProjectInfo>
                                        {isEditing ? (
                                            <EditRow onClick={(e) => e.stopPropagation()}>
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
                                                <MemberCount>
                                                    <Users size={12} />
                                                    {memberCount}
                                                </MemberCount>
                                            </ProjectNameRow>
                                        )}
                                    </ProjectInfo>
                                </ProjectCardLeft>

                                <ProjectCardRight onClick={(e) => e.stopPropagation()}>
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
                                    <ExpandChevron $expanded={isExpanded}>
                                        <ChevronDown size={16} />
                                    </ExpandChevron>
                                </ProjectCardRight>
                            </ProjectCard>

                            {isExpanded && (
                                <MembersPanel>
                                    {members.length > 0 ? (
                                        <MembersTable>
                                            <thead>
                                                <MembersTr>
                                                    <MembersTh>{t('projects.members.name', 'Name')}</MembersTh>
                                                    <MembersTh>{t('projects.members.email', 'Email')}</MembersTh>
                                                    <MembersTh>{t('projects.members.role', 'Role')}</MembersTh>
                                                    <MembersTh style={{ width: 60 }} />
                                                </MembersTr>
                                            </thead>
                                            <tbody>
                                                {members.map((member) => (
                                                    <ProjectMemberRow
                                                        key={member.id || member.user_id}
                                                        projectId={project.id}
                                                        member={member}
                                                        myLevel={myLevel}
                                                        currentUserId={currentUserId}
                                                        onUpdateRole={handleUpdateRole}
                                                        onRemove={handleRemoveMember}
                                                    />
                                                ))}
                                            </tbody>
                                        </MembersTable>
                                    ) : (
                                        <NoMembersText>
                                            {t('projects.members.empty', 'No members assigned to this project.')}
                                        </NoMembersText>
                                    )}
                                </MembersPanel>
                            )}
                        </ProjectCardWrapper>
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
// ProjectMemberRow sub-component
// ---------------------------------------------------------------------------

type ProjectMemberRowProps = {
    projectId: string;
    member: ProjectMember;
    myLevel: number;
    currentUserId: string;
    onUpdateRole: (projectId: string, membershipId: string, role: ProjectRole) => Promise<void>;
    onRemove: (projectId: string, membershipId: string) => Promise<void>;
};

const ProjectMemberRow = ({
    projectId,
    member,
    myLevel,
    currentUserId,
    onUpdateRole,
    onRemove,
}: ProjectMemberRowProps) => {
    const { t } = useTranslation();
    const [confirmRemove, setConfirmRemove] = useState(false);

    const isMe = member.user_id === currentUserId;
    const canModify = !isMe && canModifyMember(myLevel, member);
    const assignableRoles = getAssignableRoles(myLevel);

    const initials = (member.name ?? member.email ?? '?').charAt(0).toUpperCase();

    const roleLabel = member.is_workspace_owner
        ? t('projects.roles.owner', 'Owner')
        : t(`projects.roles.${member.role}`, member.role);

    return (
        <>
            <MembersTr>
                <MembersTd>
                    <UserCell>
                        {member.picture_url ? (
                            <Avatar src={member.picture_url} alt="" />
                        ) : (
                            <AvatarFallback>{initials}</AvatarFallback>
                        )}
                        <UserName>
                            {member.name || member.email}
                            {isMe && <YouBadge>{t('projects.members.you', 'you')}</YouBadge>}
                        </UserName>
                    </UserCell>
                </MembersTd>
                <MembersTd>
                    <EmailText>{member.email}</EmailText>
                </MembersTd>
                <MembersTd>
                    {canModify && assignableRoles.length > 0 ? (
                        <RoleSelect
                            value={member.role}
                            onChange={(e) =>
                                onUpdateRole(projectId, member.id, e.target.value as ProjectRole)
                            }
                        >
                            {/* Include current role even if not assignable (e.g. admin viewing admin) */}
                            {!assignableRoles.includes(member.role) && (
                                <option value={member.role}>
                                    {t(`projects.roles.${member.role}`, member.role)}
                                </option>
                            )}
                            {assignableRoles.map((r) => (
                                <option key={r} value={r}>
                                    {t(`projects.roles.${r}`, r)}
                                </option>
                            ))}
                        </RoleSelect>
                    ) : (
                        <RoleBadge $isOwner={!!member.is_workspace_owner}>
                            {roleLabel}
                        </RoleBadge>
                    )}
                </MembersTd>
                <MembersTd style={{ textAlign: 'right' }}>
                    {canModify && (
                        <RemoveBtn
                            onClick={() => setConfirmRemove(true)}
                            title={t('projects.members.remove', 'Remove from project')}
                        >
                            <Trash2 size={14} />
                        </RemoveBtn>
                    )}
                </MembersTd>
            </MembersTr>
            {confirmRemove && (
                <MembersTr>
                    <MembersTd colSpan={4}>
                        <ConfirmRow>
                            <ConfirmText>
                                {t(
                                    'projects.members.confirmRemove',
                                    'Remove {{name}} from this project?',
                                    { name: member.name || member.email },
                                )}
                            </ConfirmText>
                            <ConfirmActions>
                                <DeleteBtn
                                    onClick={() => {
                                        setConfirmRemove(false);
                                        onRemove(projectId, member.id);
                                    }}
                                >
                                    {t('projects.members.remove', 'Remove')}
                                </DeleteBtn>
                                <CancelBtn onClick={() => setConfirmRemove(false)}>
                                    {t('common.cancel', 'Cancel')}
                                </CancelBtn>
                            </ConfirmActions>
                        </ConfirmRow>
                    </MembersTd>
                </MembersTr>
            )}
        </>
    );
};

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

const ProjectCardWrapper = styled.div`
    border: 1px solid var(--border-light);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 150ms ease;

    &:hover {
        border-color: var(--overlay-strong);
    }
`;

const ProjectCard = styled.div<{ $expanded?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--overlay-subtle);
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
        background: var(--overlay-light);
    }

    ${({ $expanded }) =>
        $expanded &&
        `
        border-bottom: 1px solid var(--border-light);
    `}
`;

const ProjectCardLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 0;
`;

const ProjectCardRight = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
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

const MemberCount = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin-left: 4px;
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

const ExpandChevron = styled.span<{ $expanded?: boolean }>`
    display: flex;
    align-items: center;
    color: hsl(var(--muted-foreground));
    transition: transform 200ms ease;
    transform: ${({ $expanded }) => ($expanded ? 'rotate(180deg)' : 'rotate(0)')};
    margin-left: 8px;
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

// ---------------------------------------------------------------------------
// Expanded members panel
// ---------------------------------------------------------------------------

const MembersPanel = styled.div`
    background: hsl(var(--sidebar-background));
    padding: 0;
`;

const MembersTable = styled.table`
    width: 100%;
    border-collapse: collapse;
`;

const MembersTr = styled.tr`
    border-bottom: 1px solid var(--border-subtle);

    &:last-child {
        border-bottom: none;
    }
`;

const MembersTh = styled.th`
    text-align: left;
    padding: 10px 16px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
    background: var(--overlay-subtle);
`;

const MembersTd = styled.td`
    padding: 10px 16px;
    font-size: 13px;
    color: hsl(var(--foreground));
    vertical-align: middle;
`;

const UserCell = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const Avatar = styled.img`
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
`;

const AvatarFallback = styled.div`
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: hsla(var(--primary) / 0.2);
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
`;

const UserName = styled.span`
    font-weight: 500;
    color: hsl(var(--foreground));
    display: flex;
    align-items: center;
    gap: 6px;
`;

const YouBadge = styled.span`
    font-size: 10px;
    font-weight: 400;
    color: hsl(var(--muted-foreground));
    background: var(--overlay-light);
    padding: 1px 6px;
    border-radius: 3px;
`;

const EmailText = styled.span`
    color: hsl(var(--muted-foreground));
    font-size: 13px;
`;

const RoleBadge = styled.span<{ $isOwner: boolean }>`
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 12px;
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

const RoleSelect = styled.select`
    padding: 4px 10px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--foreground));
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

const RemoveBtn = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 5px;
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

const ConfirmRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
`;

const ConfirmText = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

const ConfirmActions = styled.div`
    display: flex;
    gap: 6px;
`;

const NoMembersText = styled.p`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    padding: 20px 16px;
    margin: 0;
`;
