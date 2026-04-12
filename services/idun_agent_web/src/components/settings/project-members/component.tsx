import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

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

const PROJECT_ROLE_OPTIONS: ProjectRole[] = ['admin', 'contributor', 'reader'];

const ProjectMembersTab = () => {
    const { t } = useTranslation();
    const { isCurrentWorkspaceOwner } = useWorkspace();
    const { currentProject, currentRole, canAdmin } = useProject();
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<ProjectRole>(
        isCurrentWorkspaceOwner ? 'admin' : 'reader'
    );
    useEffect(() => {
        if (!isCurrentWorkspaceOwner && role === 'admin') {
            setRole('reader');
        }
    }, [isCurrentWorkspaceOwner, role]);


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

    const handleAddMember = async () => {
        if (!currentProject || !email.trim()) return;
        try {
            await addProjectMember(currentProject.id, {
                email: email.trim(),
                role,
            });
            setEmail('');
            setRole('reader');
            await loadMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to add project member');
        }
    };

    const handleRoleChange = async (member: ProjectMember, nextRole: ProjectRole) => {
        if (!currentProject) return;
        try {
            await updateProjectMemberRole(currentProject.id, member.id, {
                role: nextRole,
            });
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
            await loadMembers();
        } catch (error) {
            console.error(error);
            notify.error(error instanceof Error ? error.message : 'Failed to remove member');
        }
    };

    return (
        <Container>
            <SectionCard>
                <SectionTitle>
                    {currentProject
                        ? `${t('settings.projects.project', 'Project')}: ${currentProject.name}`
                        : t('settings.projects.noCurrentProject', 'Select a project first.')}
                </SectionTitle>
                <RoleBadge>{currentRole ?? 'no access'}</RoleBadge>

                {canAdmin && currentProject && (
                    <CreateRow>
                        <Input
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder={t('settings.projects.memberEmail', 'Email')}
                        />
                        <Select
                            value={role}
                            onChange={(event) => setRole(event.target.value as ProjectRole)}
                        >
                            {PROJECT_ROLE_OPTIONS.map((option) => (
                                <option
                                    key={option}
                                    value={option}
                                    disabled={option === 'admin' && !isCurrentWorkspaceOwner}
                                >
                                    {option}
                                </option>
                            ))}
                        </Select>
                        <PrimaryButton onClick={handleAddMember}>
                            {t('settings.projects.addMember', 'Add member')}
                        </PrimaryButton>
                    </CreateRow>
                )}
            </SectionCard>

            <SectionCard>
                <SectionTitle>
                    {t('settings.projects.membersList', 'Members')} ({members.length})
                </SectionTitle>
                {loading ? (
                    <StatusText>{t('common.loading', 'Loading...')}</StatusText>
                ) : !currentProject ? (
                    <StatusText>{t('settings.projects.noCurrentProject', 'Select a project first.')}</StatusText>
                ) : members.length === 0 ? (
                    <StatusText>{t('settings.projects.noMembers', 'No project members yet.')}</StatusText>
                ) : (
                    <Table>
                        <thead>
                            <tr>
                                <th>{t('settings.workspaces.users.name', 'Name')}</th>
                                <th>{t('settings.workspaces.users.email', 'Email')}</th>
                                <th>{t('settings.workspaces.users.role', 'Role')}</th>
                                {canAdmin && <th>{t('settings.workspaces.users.actions', 'Actions')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((member) => (
                                <tr key={member.id}>
                                    <td>{member.name || member.email}</td>
                                    <td>{member.email}</td>
                                    <td>
                                        {canAdmin ? (
                                            <Select
                                                value={member.role}
                                                onChange={(event) =>
                                                    void handleRoleChange(
                                                        member,
                                                        event.target.value as ProjectRole
                                                    )
                                                }
                                            >
                                                {PROJECT_ROLE_OPTIONS.map((option) => (
                                                    <option
                                                        key={option}
                                                        value={option}
                                                        disabled={option === 'admin' && !isCurrentWorkspaceOwner}
                                                    >
                                                        {option}
                                                    </option>
                                                ))}
                                            </Select>
                                        ) : (
                                            member.role
                                        )}
                                    </td>
                                    {canAdmin && (
                                        <td>
                                            <DangerButton onClick={() => void handleRemove(member)}>
                                                {t('common.remove', 'Remove')}
                                            </DangerButton>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </SectionCard>
        </Container>
    );
};

export default ProjectMembersTab;

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

const RoleBadge = styled.span`
    display: inline-flex;
    padding: 4px 8px;
    border-radius: 999px;
    background: hsla(var(--primary) / 0.12);
    color: hsl(var(--primary));
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
    margin-bottom: 16px;
`;

const CreateRow = styled.div`
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
`;

const Input = styled.input`
    padding: 9px 12px;
    border-radius: 7px;
    border: 1px solid var(--border-subtle);
    background: var(--overlay-subtle);
    color: hsl(var(--foreground));
    font-size: 13px;

    &:focus {
        outline: none;
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.2);
    }
`;

const Select = styled.select`
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    color: hsl(var(--foreground));
`;

const PrimaryButton = styled.button`
    padding: 9px 16px;
    border-radius: 7px;
    border: none;
    background: hsl(var(--primary));
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
`;

const StatusText = styled.p`
    margin: 0;
    color: hsl(var(--muted-foreground));
    font-size: 14px;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;

    th,
    td {
        padding: 12px 8px;
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

const DangerButton = styled.button`
    border: none;
    background: transparent;
    color: hsl(var(--destructive));
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
`;
