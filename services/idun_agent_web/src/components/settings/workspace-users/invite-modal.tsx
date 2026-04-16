import { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, Crown, Pencil, Eye, Check, FolderOpen } from 'lucide-react';

import { useProject } from '../../../hooks/use-project';
import type { ProjectAssignment } from '../../../services/members';

type RoleOption = 'owner' | 'contributor' | 'reader';

type Props = {
    onSubmit: (data: {
        email: string;
        is_owner: boolean;
        project_assignments: ProjectAssignment[];
    }) => Promise<void>;
    onClose: () => void;
};

const InviteMemberModal = ({ onSubmit, onClose }: Props) => {
    const { t } = useTranslation();
    const { projects } = useProject();
    const [email, setEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState<RoleOption>('contributor');
    const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (selectedRole === 'owner') {
            setSelectedProjectIds(new Set());
        }
    }, [selectedRole]);

    const toggleProject = (projectId: string) => {
        setSelectedProjectIds((current) => {
            const next = new Set(current);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });
    };

    const derivedProjectRole = selectedRole === 'reader' ? 'reader' : 'contributor';

    const handleSubmit = async () => {
        if (!email.trim() || submitting) return;
        setSubmitting(true);
        const assignments: ProjectAssignment[] = [...selectedProjectIds].map((id) => ({
            project_id: id,
            role: derivedProjectRole,
        }));
        try {
            await onSubmit({
                email: email.trim(),
                is_owner: selectedRole === 'owner',
                project_assignments: selectedRole === 'owner' ? [] : assignments,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === backdropRef.current) onClose();
    };

    const roles: {
        key: RoleOption;
        icon: typeof Crown;
        permissions: string[];
    }[] = [
        {
            key: 'owner',
            icon: Crown,
            permissions: [
                t('settings.workspaces.users.modal.perm.ownerWorkspace', 'Manage workspace settings and billing'),
                t('settings.workspaces.users.modal.perm.ownerMembers', 'Invite and remove workspace members'),
                t('settings.workspaces.users.modal.perm.ownerProjects', 'Full access to all projects and resources'),
                t('settings.workspaces.users.modal.perm.ownerRoles', 'Assign roles and manage permissions'),
            ],
        },
        {
            key: 'contributor',
            icon: Pencil,
            permissions: [
                t('settings.workspaces.users.modal.perm.contribAgents', 'Create, edit, and deploy agents'),
                t('settings.workspaces.users.modal.perm.contribResources', 'Manage resources (MCP, memory, guardrails)'),
                t('settings.workspaces.users.modal.perm.contribPrompts', 'Create and edit prompts'),
                t('settings.workspaces.users.modal.perm.contribView', 'View observability data and logs'),
            ],
        },
        {
            key: 'reader',
            icon: Eye,
            permissions: [
                t('settings.workspaces.users.modal.perm.readerAgents', 'View agents and their configurations'),
                t('settings.workspaces.users.modal.perm.readerResources', 'View resources and integrations'),
                t('settings.workspaces.users.modal.perm.readerLogs', 'View observability data and logs'),
                t('settings.workspaces.users.modal.perm.readerNoEdit', 'Cannot create or modify resources'),
            ],
        },
    ];

    return (
        <Backdrop ref={backdropRef} onClick={handleBackdropClick}>
            <Modal>
                <Header>
                    <Title>{t('settings.workspaces.users.modal.title', 'Invite member')}</Title>
                    <CloseButton onClick={onClose}>
                        <X size={16} />
                    </CloseButton>
                </Header>

                <Body>
                    <FieldLabel>{t('settings.workspaces.users.modal.emailLabel', 'Email address')}</FieldLabel>
                    <EmailInput
                        type="email"
                        placeholder={t('settings.workspaces.users.modal.emailPlaceholder', 'name@company.com')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoFocus
                    />

                    <FieldLabel>{t('settings.workspaces.users.modal.roleLabel', 'Select a role')}</FieldLabel>
                    <RoleGrid>
                        {roles.map(({ key, icon: Icon, permissions }) => (
                            <RoleCard
                                key={key}
                                $selected={selectedRole === key}
                                onClick={() => setSelectedRole(key)}
                            >
                                <RoleHeader>
                                    <RoleIconWrap $selected={selectedRole === key}>
                                        <Icon size={16} />
                                    </RoleIconWrap>
                                    <RoleName>
                                        {t(`settings.workspaces.users.modal.role.${key}`, key)}
                                    </RoleName>
                                    {selectedRole === key && (
                                        <SelectedBadge>
                                            <Check size={12} />
                                        </SelectedBadge>
                                    )}
                                </RoleHeader>
                                <PermissionList>
                                    {permissions.map((perm, i) => (
                                        <PermissionItem key={i}>
                                            <PermDot $selected={selectedRole === key} />
                                            {perm}
                                        </PermissionItem>
                                    ))}
                                </PermissionList>
                            </RoleCard>
                        ))}
                    </RoleGrid>

                    {selectedRole !== 'owner' && projects.length > 0 && (
                        <>
                            <FieldLabel>
                                {t('settings.workspaces.users.modal.projectsLabel', 'Assign to projects')}
                            </FieldLabel>
                            <ProjectGrid>
                                {projects.map((project) => {
                                    const selected = selectedProjectIds.has(project.id);
                                    return (
                                        <ProjectCard
                                            key={project.id}
                                            $selected={selected}
                                            onClick={() => toggleProject(project.id)}
                                        >
                                            <ProjectCardLeft>
                                                <ProjectIconWrap $selected={selected}>
                                                    <FolderOpen size={14} />
                                                </ProjectIconWrap>
                                                <ProjectName>{project.name}</ProjectName>
                                            </ProjectCardLeft>
                                            <ProjectCardRight>
                                                {selected && (
                                                    <ProjectRoleBadge>
                                                        {derivedProjectRole}
                                                    </ProjectRoleBadge>
                                                )}
                                                <CheckCircle $selected={selected}>
                                                    {selected && <Check size={10} />}
                                                </CheckCircle>
                                            </ProjectCardRight>
                                        </ProjectCard>
                                    );
                                })}
                            </ProjectGrid>
                        </>
                    )}
                </Body>

                <Footer>
                    <CancelButton onClick={onClose}>
                        {t('common.cancel', 'Cancel')}
                    </CancelButton>
                    <SubmitButton onClick={handleSubmit} disabled={!email.trim() || submitting}>
                        {submitting
                            ? t('common.sending', 'Sending...')
                            : t('settings.workspaces.users.modal.submit', 'Send invitation')}
                    </SubmitButton>
                </Footer>
            </Modal>
        </Backdrop>
    );
};

export default InviteMemberModal;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    backdrop-filter: blur(2px);
`;

const Modal = styled.div`
    background: hsl(var(--card));
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    width: 560px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border-subtle);
`;

const Title = styled.h3`
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms ease, color 150ms ease;

    &:hover {
        background: var(--overlay-light);
        color: hsl(var(--foreground));
    }
`;

const Body = styled.div`
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const FieldLabel = styled.label`
    font-size: 12px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-top: 8px;

    &:first-child {
        margin-top: 0;
    }
`;

const EmailInput = styled.input`
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: var(--overlay-subtle);
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: inherit;
    margin-bottom: 4px;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.15);
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const RoleGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 2px;
`;

const RoleCard = styled.button<{ $selected: boolean }>`
    background: ${({ $selected }) =>
        $selected ? 'hsla(var(--primary) / 0.06)' : 'var(--overlay-subtle)'};
    border: 1.5px solid ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'var(--border-subtle)'};
    border-radius: 10px;
    padding: 14px 16px;
    text-align: left;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease;
    font-family: inherit;
    width: 100%;

    &:hover {
        border-color: ${({ $selected }) =>
            $selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
        background: ${({ $selected }) =>
            $selected ? 'hsla(var(--primary) / 0.08)' : 'var(--overlay-light)'};
    }
`;

const RoleHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
`;

const RoleIconWrap = styled.div<{ $selected: boolean }>`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${({ $selected }) =>
        $selected ? 'hsla(var(--primary) / 0.15)' : 'var(--overlay-light)'};
    color: ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
    transition: background 150ms ease, color 150ms ease;
`;

const RoleName = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: capitalize;
`;

const SelectedBadge = styled.span`
    margin-left: auto;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    display: flex;
    align-items: center;
    justify-content: center;
`;

const PermissionList = styled.ul`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
`;

const PermissionItem = styled.li`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    line-height: 1.4;
`;

const PermDot = styled.span<{ $selected: boolean }>`
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    background: ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
    opacity: ${({ $selected }) => ($selected ? 1 : 0.5)};
`;

const ProjectGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
`;

const ProjectCard = styled.button<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-radius: 9px;
    border: 1.5px solid ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'var(--border-subtle)'};
    background: ${({ $selected }) =>
        $selected ? 'hsla(var(--primary) / 0.05)' : 'var(--overlay-subtle)'};
    cursor: pointer;
    font-family: inherit;
    transition: border-color 150ms ease, background 150ms ease;
    width: 100%;

    &:hover {
        border-color: ${({ $selected }) =>
            $selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
    }
`;

const ProjectCardLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const ProjectIconWrap = styled.div<{ $selected: boolean }>`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${({ $selected }) =>
        $selected ? 'hsla(var(--primary) / 0.12)' : 'var(--overlay-light)'};
    color: ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
    transition: background 150ms ease, color 150ms ease;
`;

const ProjectName = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
`;

const ProjectCardRight = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const ProjectRoleBadge = styled.span`
    font-size: 11px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    text-transform: capitalize;
`;

const CheckCircle = styled.div<{ $selected: boolean }>`
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1.5px solid ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'var(--border-subtle)'};
    background: ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'transparent'};
    color: hsl(var(--primary-foreground));
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms ease;
    flex-shrink: 0;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 20px;
    border-top: 1px solid var(--border-subtle);
`;

const CancelButton = styled.button`
    padding: 8px 16px;
    border-radius: 7px;
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background 150ms ease;

    &:hover {
        background: var(--overlay-light);
    }
`;

const SubmitButton = styled.button`
    padding: 8px 18px;
    border-radius: 7px;
    border: none;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 150ms ease;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &:not(:disabled):hover {
        opacity: 0.9;
    }
`;
