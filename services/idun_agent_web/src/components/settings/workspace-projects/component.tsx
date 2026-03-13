import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styled, { keyframes } from 'styled-components';
import { Plus, Pencil, Trash2, Check, X, Grid3X3, Users, ChevronDown, Search } from 'lucide-react';
import { notify } from '../../toast/notify';
import { useProject, type ProjectRole } from '../../../hooks/use-project';
import { useAuth } from '../../../hooks/use-auth';
import { getJson, patchJson, postJson, deleteRequest } from '../../../utils/api';
import { listMembers, type WorkspaceMember } from '../../../services/members';

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
        refreshProjects,
    } = useProject();

    const [filterQuery, setFilterQuery] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [projectMembers, setProjectMembers] = useState<Record<string, ProjectMember[]>>({});
    const [addingToProjectId, setAddingToProjectId] = useState<string | null>(null);

    const currentUserId = session?.principal?.user_id ?? '';

    // Filter projects: owners see all, admins see only their admin projects
    const visibleProjects = isWorkspaceOwner
        ? projects
        : projects.filter((p) => projectRoles[p.id] === 'admin');

    // Apply search filter
    const filteredProjects = useMemo(() => {
        if (!filterQuery.trim()) return visibleProjects;
        const q = filterQuery.toLowerCase();
        return visibleProjects.filter((p) => p.name.toLowerCase().includes(q));
    }, [visibleProjects, filterQuery]);

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

    const handleSaveEdit = async (id: string) => {
        if (!editName.trim()) return;
        try {
            await updateProject(id, {
                name: editName.trim(),
                description: editDescription.trim() || null,
            });
            setEditingId(null);
            notify.success(t('projects.updateSuccess', 'Project updated'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to update project';
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

    const startEdit = (id: string, currentName: string, currentDescription?: string | null) => {
        setEditingId(id);
        setEditName(currentName);
        setEditDescription(currentDescription ?? '');
    };

    const toggleExpand = (id: string) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };

    const handleProjectCreated = async () => {
        setShowCreateDialog(false);
        // refreshProjects updates the projects list, which triggers
        // the useEffect on projectIds to re-fetch all project members.
        await refreshProjects();
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

            {/* Filter + Create row */}
            <ToolbarRow>
                <FilterInputWrapper>
                    <SearchIcon>
                        <Search size={15} />
                    </SearchIcon>
                    <FilterInput
                        type="text"
                        placeholder={t('projects.filterPlaceholder', 'Filter projects...')}
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                    />
                </FilterInputWrapper>
                {isWorkspaceOwner && (
                    <CreateButton onClick={() => setShowCreateDialog(true)}>
                        <Plus size={15} />
                        {t('settings.projects.createButton', 'New project')}
                    </CreateButton>
                )}
            </ToolbarRow>

            {/* Project list */}
            <ProjectGrid>
                {filteredProjects.map((project) => {
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
                                            <EditForm onClick={(e) => e.stopPropagation()}>
                                                <EditRow>
                                                    <EditInput
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && !e.shiftKey) handleSaveEdit(project.id);
                                                            if (e.key === 'Escape') setEditingId(null);
                                                        }}
                                                        placeholder={t('projects.namePlaceholder', 'Project name')}
                                                        autoFocus
                                                    />
                                                    <IconBtn onClick={() => handleSaveEdit(project.id)}>
                                                        <Check size={14} color="hsl(var(--primary))" />
                                                    </IconBtn>
                                                    <IconBtn onClick={() => setEditingId(null)}>
                                                        <X size={14} />
                                                    </IconBtn>
                                                </EditRow>
                                                <EditDescriptionInput
                                                    value={editDescription}
                                                    onChange={(e) => setEditDescription(e.target.value)}
                                                    placeholder={t('projects.descriptionPlaceholder', 'Optional project description...')}
                                                    rows={2}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                />
                                            </EditForm>
                                        ) : (
                                            <>
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
                                                {project.description && (
                                                    <ProjectDescription>{project.description}</ProjectDescription>
                                                )}
                                            </>
                                        )}
                                    </ProjectInfo>
                                </ProjectCardLeft>

                                <ProjectCardRight onClick={(e) => e.stopPropagation()}>
                                    {!isEditing && !isDeleting && (
                                        <ProjectActions>
                                            <IconBtn
                                                onClick={() => startEdit(project.id, project.name, project.description)}
                                                title={t('projects.edit', 'Edit')}
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
                                    {(isWorkspaceOwner || (userRole && ROLE_LEVEL[userRole] >= ROLE_LEVEL.admin)) && (
                                        <AddMemberButtonRow>
                                            <AddMemberBtn onClick={(e) => {
                                                e.stopPropagation();
                                                setAddingToProjectId(project.id);
                                            }}>
                                                <Plus size={14} />
                                                {t('projects.members.addMember', 'Add member')}
                                            </AddMemberBtn>
                                        </AddMemberButtonRow>
                                    )}
                                </MembersPanel>
                            )}
                        </ProjectCardWrapper>
                    );
                })}

                {filteredProjects.length === 0 && visibleProjects.length > 0 && (
                    <EmptyText>{t('projects.noFilterResults', 'No projects match your filter.')}</EmptyText>
                )}

                {visibleProjects.length === 0 && (
                    <EmptyText>{t('projects.noProjects', 'No projects yet.')}</EmptyText>
                )}
            </ProjectGrid>

            {/* Create project dialog */}
            {showCreateDialog && (
                <CreateProjectDialog
                    onCreated={handleProjectCreated}
                    onClose={() => setShowCreateDialog(false)}
                />
            )}

            {/* Add member to project dialog */}
            {addingToProjectId && (() => {
                const project = visibleProjects.find((p) => p.id === addingToProjectId);
                if (!project) return null;
                return (
                    <AddProjectMembersDialog
                        projectId={addingToProjectId}
                        projectName={project.name}
                        existingMembers={projectMembers[addingToProjectId] ?? []}
                        onAdded={() => refreshSingleProject(addingToProjectId)}
                        onClose={() => setAddingToProjectId(null)}
                    />
                );
            })()}
        </Container>
    );
};

export default WorkspaceProjectsTab;

// ---------------------------------------------------------------------------
// CreateProjectDialog
// ---------------------------------------------------------------------------

type CreateProjectDialogProps = {
    onCreated: () => void;
    onClose: () => void;
};

const CreateProjectDialog = ({ onCreated, onClose }: CreateProjectDialogProps) => {
    const { t } = useTranslation();
    const { createProject } = useProject();
    const { session } = useAuth();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Workspace members for selection
    const [wsMembers, setWsMembers] = useState<WorkspaceMember[]>([]);
    const [memberSearch, setMemberSearch] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<
        Record<string, ProjectRole>
    >({});
    const [loadingMembers, setLoadingMembers] = useState(true);

    const activeWorkspaceId =
        typeof window !== 'undefined' ? localStorage.getItem('activeTenantId') : null;

    // Fetch workspace members on open
    useEffect(() => {
        if (!activeWorkspaceId) {
            setLoadingMembers(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await listMembers(activeWorkspaceId);
                if (!cancelled) setWsMembers(res.members);
            } catch {
                // silently ignore
            } finally {
                if (!cancelled) setLoadingMembers(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activeWorkspaceId]);

    // Filter out owners (they're implicit admins) and the current user
    const availableMembers = useMemo(() => {
        return wsMembers.filter((m) => !m.is_owner);
    }, [wsMembers]);

    // Apply search filter
    const filteredMembers = useMemo(() => {
        if (!memberSearch.trim()) return availableMembers;
        const q = memberSearch.toLowerCase();
        return availableMembers.filter(
            (m) =>
                m.email.toLowerCase().includes(q) ||
                (m.name && m.name.toLowerCase().includes(q)),
        );
    }, [availableMembers, memberSearch]);

    const toggleMember = (userId: string) => {
        setSelectedMembers((prev) => {
            const next = { ...prev };
            if (next[userId]) {
                delete next[userId];
            } else {
                next[userId] = 'contributor';
            }
            return next;
        });
    };

    const setMemberRole = (userId: string, role: ProjectRole) => {
        setSelectedMembers((prev) => ({ ...prev, [userId]: role }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError(t('projects.nameRequired', 'Project name is required'));
            return;
        }

        setSubmitting(true);
        try {
            const members = Object.entries(selectedMembers).map(
                ([user_id, role]) => ({ user_id, role }),
            );
            await createProject({
                name: name.trim(),
                description: description.trim() || undefined,
                members,
            });
            notify.success(t('projects.createSuccess', 'Project created'));
            onCreated();
        } catch (err: unknown) {
            const msg =
                err instanceof Error ? err.message : 'Failed to create project';
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
                        {t('projects.createTitle', 'New project')}
                    </DialogTitle>
                    <CloseButton onClick={onClose}>
                        <X size={18} />
                    </CloseButton>
                </DialogHeader>

                <DialogDescription>
                    {t(
                        'projects.createDescription',
                        'Create a new project and optionally add members.',
                    )}
                </DialogDescription>

                <Form onSubmit={handleSubmit}>
                    <FieldGroup>
                        <FieldLabel>
                            {t('projects.nameLabel', 'Project name')}
                        </FieldLabel>
                        <Input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('projects.namePlaceholder', 'Project name')}
                            autoFocus
                        />
                    </FieldGroup>

                    <FieldGroup>
                        <FieldLabel>
                            {t('projects.descriptionLabel', 'Description')}
                        </FieldLabel>
                        <TextArea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t(
                                'projects.descriptionPlaceholder',
                                'Optional project description...',
                            )}
                            rows={3}
                        />
                    </FieldGroup>

                    <FieldGroup>
                        <FieldLabel>
                            {t('projects.membersLabel', 'Members')}
                        </FieldLabel>
                        <MemberSearchInput
                            type="text"
                            placeholder={t(
                                'projects.searchMembers',
                                'Search members...',
                            )}
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                        />
                        <MemberList>
                            {loadingMembers ? (
                                <MemberListEmpty>
                                    {t('common.loading', 'Loading...')}
                                </MemberListEmpty>
                            ) : filteredMembers.length === 0 ? (
                                <MemberListEmpty>
                                    {availableMembers.length === 0
                                        ? t(
                                              'projects.noAvailableMembers',
                                              'No non-owner members in this workspace.',
                                          )
                                        : t(
                                              'projects.noMemberResults',
                                              'No members match your search.',
                                          )}
                                </MemberListEmpty>
                            ) : (
                                filteredMembers.map((member) => {
                                    const isSelected = !!selectedMembers[member.user_id];
                                    const initials = (
                                        member.name ?? member.email ?? '?'
                                    )
                                        .charAt(0)
                                        .toUpperCase();

                                    return (
                                        <MemberRow
                                            key={member.user_id}
                                            $selected={isSelected}
                                        >
                                            <MemberCheckArea
                                                onClick={() =>
                                                    toggleMember(member.user_id)
                                                }
                                            >
                                                <MemberCheckbox $checked={isSelected}>
                                                    {isSelected && (
                                                        <Check
                                                            size={11}
                                                            color="hsl(var(--primary))"
                                                        />
                                                    )}
                                                </MemberCheckbox>
                                                {member.picture_url ? (
                                                    <MemberAvatar
                                                        src={member.picture_url}
                                                        alt=""
                                                    />
                                                ) : (
                                                    <MemberAvatarFallback>
                                                        {initials}
                                                    </MemberAvatarFallback>
                                                )}
                                                <MemberInfo>
                                                    <MemberName>
                                                        {member.name || member.email}
                                                    </MemberName>
                                                    {member.name && (
                                                        <MemberEmail>
                                                            {member.email}
                                                        </MemberEmail>
                                                    )}
                                                </MemberInfo>
                                            </MemberCheckArea>
                                            {isSelected ? (
                                                <MemberRoleSelect
                                                    value={
                                                        selectedMembers[
                                                            member.user_id
                                                        ]
                                                    }
                                                    onChange={(e) =>
                                                        setMemberRole(
                                                            member.user_id,
                                                            e.target
                                                                .value as ProjectRole,
                                                        )
                                                    }
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <option value="admin">
                                                        {t(
                                                            'projects.roles.admin',
                                                            'Admin',
                                                        )}
                                                    </option>
                                                    <option value="contributor">
                                                        {t(
                                                            'projects.roles.contributor',
                                                            'Contributor',
                                                        )}
                                                    </option>
                                                    <option value="reader">
                                                        {t(
                                                            'projects.roles.reader',
                                                            'Reader',
                                                        )}
                                                    </option>
                                                </MemberRoleSelect>
                                            ) : (
                                                <MemberRoleDash>—</MemberRoleDash>
                                            )}
                                        </MemberRow>
                                    );
                                })
                            )}
                        </MemberList>
                    </FieldGroup>

                    {error && <ErrorText>{error}</ErrorText>}

                    <DialogActions>
                        <CancelButton type="button" onClick={onClose}>
                            {t('common.cancel', 'Cancel')}
                        </CancelButton>
                        <SubmitButton type="submit" disabled={submitting || !name.trim()}>
                            {submitting
                                ? t('common.creating', 'Creating...')
                                : t('projects.create', 'Create')}
                        </SubmitButton>
                    </DialogActions>
                </Form>
            </Dialog>
        </Overlay>
    );
};

// ---------------------------------------------------------------------------
// AddProjectMembersDialog
// ---------------------------------------------------------------------------

type AddProjectMembersDialogProps = {
    projectId: string;
    projectName: string;
    existingMembers: ProjectMember[];
    onAdded: () => void;
    onClose: () => void;
};

const AddProjectMembersDialog = ({
    projectId,
    projectName,
    existingMembers,
    onAdded,
    onClose,
}: AddProjectMembersDialogProps) => {
    const { t } = useTranslation();
    const [wsMembers, setWsMembers] = useState<WorkspaceMember[]>([]);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Record<string, ProjectRole>>({});
    const [submitting, setSubmitting] = useState(false);
    const [loadingMembers, setLoadingMembers] = useState(true);

    const activeWorkspaceId =
        typeof window !== 'undefined' ? localStorage.getItem('activeTenantId') : null;

    useEffect(() => {
        if (!activeWorkspaceId) {
            setLoadingMembers(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await listMembers(activeWorkspaceId);
                if (!cancelled) setWsMembers(res.members);
            } catch {
                // ignore
            } finally {
                if (!cancelled) setLoadingMembers(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeWorkspaceId]);

    const existingUserIds = new Set(existingMembers.map((m) => m.user_id));

    const available = useMemo(() => {
        return wsMembers.filter(
            (m) => !m.is_owner && !existingUserIds.has(m.user_id),
        );
    }, [wsMembers, existingUserIds]);

    const filtered = useMemo(() => {
        if (!search.trim()) return available;
        const q = search.toLowerCase();
        return available.filter(
            (m) =>
                m.email.toLowerCase().includes(q) ||
                (m.name && m.name.toLowerCase().includes(q)),
        );
    }, [available, search]);

    const toggleMember = (userId: string) => {
        setSelected((prev) => {
            const next = { ...prev };
            if (next[userId]) {
                delete next[userId];
            } else {
                next[userId] = 'contributor';
            }
            return next;
        });
    };

    const setMemberRole = (userId: string, role: ProjectRole) => {
        setSelected((prev) => ({ ...prev, [userId]: role }));
    };

    const selectedCount = Object.keys(selected).length;

    const handleSubmit = async () => {
        if (selectedCount === 0) return;
        setSubmitting(true);
        try {
            await Promise.all(
                Object.entries(selected).map(([user_id, role]) =>
                    postJson(`/api/v1/projects/${projectId}/members`, { user_id, role }),
                ),
            );
            notify.success(
                t('projects.members.addedCount', '{{count}} member(s) added', { count: selectedCount }),
            );
            onAdded();
            onClose();
        } catch (err: unknown) {
            const raw = err instanceof Error ? err.message : '';
            let detail = '';
            try { detail = JSON.parse(raw).detail ?? ''; } catch { detail = raw; }
            notify.error(detail || t('projects.members.addError', 'Failed to add members'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Overlay onClick={onClose}>
            <Dialog onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>
                        {t('projects.members.addTitle', 'Add members to {{name}}', { name: projectName })}
                    </DialogTitle>
                    <CloseButton onClick={onClose}>
                        <X size={18} />
                    </CloseButton>
                </DialogHeader>
                <DialogDescription>
                    {t('projects.members.addDescription', 'Select workspace members to add to this project.')}
                </DialogDescription>

                <MemberSearchInput
                    type="text"
                    placeholder={t('projects.searchMembers', 'Search members...')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <MemberList style={{ marginTop: 8 }}>
                    {loadingMembers ? (
                        <MemberListEmpty>{t('common.loading', 'Loading...')}</MemberListEmpty>
                    ) : filtered.length === 0 ? (
                        <MemberListEmpty>
                            {available.length === 0
                                ? t('projects.members.allAssigned', 'All workspace members are already in this project.')
                                : t('projects.noMemberResults', 'No members match your search.')}
                        </MemberListEmpty>
                    ) : (
                        filtered.map((member) => {
                            const isSelected = !!selected[member.user_id];
                            const initials = (member.name ?? member.email ?? '?')
                                .charAt(0)
                                .toUpperCase();
                            return (
                                <MemberRow key={member.user_id} $selected={isSelected}>
                                    <MemberCheckArea onClick={() => toggleMember(member.user_id)}>
                                        <MemberCheckbox $checked={isSelected}>
                                            {isSelected && <Check size={11} color="hsl(var(--primary))" />}
                                        </MemberCheckbox>
                                        {member.picture_url ? (
                                            <MemberAvatar src={member.picture_url} alt="" />
                                        ) : (
                                            <MemberAvatarFallback>{initials}</MemberAvatarFallback>
                                        )}
                                        <MemberInfo>
                                            <MemberName>
                                                {member.name || member.email}
                                            </MemberName>
                                            {member.name && (
                                                <MemberEmail>{member.email}</MemberEmail>
                                            )}
                                        </MemberInfo>
                                    </MemberCheckArea>
                                    {isSelected ? (
                                        <MemberRoleSelect
                                            value={selected[member.user_id]}
                                            onChange={(e) =>
                                                setMemberRole(member.user_id, e.target.value as ProjectRole)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <option value="admin">{t('projects.roles.admin', 'Admin')}</option>
                                            <option value="contributor">{t('projects.roles.contributor', 'Contributor')}</option>
                                            <option value="reader">{t('projects.roles.reader', 'Reader')}</option>
                                        </MemberRoleSelect>
                                    ) : (
                                        <MemberRoleDash>—</MemberRoleDash>
                                    )}
                                </MemberRow>
                            );
                        })
                    )}
                </MemberList>

                <DialogActions>
                    <CancelButton type="button" onClick={onClose}>
                        {t('common.cancel', 'Cancel')}
                    </CancelButton>
                    <SubmitButton
                        onClick={handleSubmit}
                        disabled={submitting || selectedCount === 0}
                    >
                        {submitting
                            ? t('common.adding', 'Adding...')
                            : t('projects.members.addCount', 'Add {{count}} member(s)', { count: selectedCount })}
                    </SubmitButton>
                </DialogActions>
            </Dialog>
        </Overlay>
    );
};

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

const ToolbarRow = styled.div`
    display: flex;
    gap: 10px;
    align-items: center;
`;

const FilterInputWrapper = styled.div`
    position: relative;
    flex: 1;
    max-width: 320px;
`;

const SearchIcon = styled.span`
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: hsl(var(--muted-foreground));
    display: flex;
    align-items: center;
    pointer-events: none;
`;

const FilterInput = styled.input`
    width: 100%;
    padding: 9px 14px 9px 36px;
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

const EditForm = styled.div`
    display: flex;
    flex-direction: column;
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

const EditDescriptionInput = styled.textarea`
    padding: 5px 10px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    min-height: 36px;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const ProjectDescription = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 400px;
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

const AddMemberButtonRow = styled.div`
    padding: 12px 16px;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    justify-content: center;
`;

const AddMemberBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: transparent;
    border: 1px dashed var(--border-light);
    border-radius: 7px;
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms;

    &:hover {
        border-color: hsl(var(--primary));
        color: hsl(var(--primary));
        background: hsla(var(--primary) / 0.05);
    }
`;

// ---------------------------------------------------------------------------
// Dialog styled components
// ---------------------------------------------------------------------------

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
    max-width: 540px;
    margin: 16px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    animation: ${slideUp} 200ms ease;
    max-height: calc(100vh - 64px);
    overflow-y: auto;
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

const TextArea = styled.textarea`
    padding: 10px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-family: inherit;
    transition: border-color 150ms ease;
    resize: vertical;
    min-height: 60px;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const MemberSearchInput = styled.input`
    padding: 8px 12px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: inherit;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const MemberList = styled.div`
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
    max-height: 240px;
    overflow-y: auto;
`;

const MemberListEmpty = styled.div`
    padding: 16px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
`;

const MemberRow = styled.div<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: ${({ $selected }) =>
        $selected ? 'hsla(var(--primary) / 0.04)' : 'transparent'};

    & + & {
        border-top: 1px solid var(--border-subtle);
    }
`;

const MemberCheckArea = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
`;

const MemberCheckbox = styled.div<{ $checked: boolean }>`
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

const MemberAvatar = styled.img`
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
`;

const MemberAvatarFallback = styled.div`
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
    flex-shrink: 0;
`;

const MemberInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
`;

const MemberName = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const MemberEmail = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const MemberRoleSelect = styled.select`
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
    flex-shrink: 0;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
    }

    option {
        background: hsl(var(--popover));
        color: hsl(var(--foreground));
    }
`;

const MemberRoleDash = styled.span`
    color: hsl(var(--muted-foreground) / 0.3);
    font-size: 12px;
    padding: 4px 10px;
    flex-shrink: 0;
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
