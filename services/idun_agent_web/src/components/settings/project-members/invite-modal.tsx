import { useState, useRef, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { X, ShieldCheck, Pencil, Eye, Check, Search } from 'lucide-react';

import useWorkspace from '../../../hooks/use-workspace';
import { listMembers, type WorkspaceMember } from '../../../services/members';
import type { ProjectRole, ProjectMember } from '../../../services/project-members';

type Props = {
    onSubmit: (data: { email: string; role: ProjectRole }) => Promise<void>;
    onClose: () => void;
    isWorkspaceOwner: boolean;
    existingMembers: ProjectMember[];
};

const InviteProjectMemberModal = ({
    onSubmit,
    onClose,
    isWorkspaceOwner,
    existingMembers,
}: Props) => {
    const { t } = useTranslation();
    const { selectedWorkspaceId } = useWorkspace();
    const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
    const [selectedRole, setSelectedRole] = useState<ProjectRole>(
        isWorkspaceOwner ? 'admin' : 'contributor',
    );
    const [submitting, setSubmitting] = useState(false);
    const backdropRef = useRef<HTMLDivElement>(null);

    const existingUserIds = new Set(existingMembers.map((m) => m.user_id));

    const fetchWorkspaceMembers = useCallback(async () => {
        if (!selectedWorkspaceId) return;
        setLoadingMembers(true);
        try {
            const response = await listMembers(selectedWorkspaceId);
            setWorkspaceMembers(response.members);
        } catch {
            setWorkspaceMembers([]);
        } finally {
            setLoadingMembers(false);
        }
    }, [selectedWorkspaceId]);

    useEffect(() => {
        void fetchWorkspaceMembers();
    }, [fetchWorkspaceMembers]);

    const availableMembers = workspaceMembers.filter(
        (m) =>
            !existingUserIds.has(m.user_id) &&
            (m.email.toLowerCase().includes(search.toLowerCase()) ||
                (m.name ?? '').toLowerCase().includes(search.toLowerCase())),
    );

    const handleSubmit = async () => {
        if (!selectedEmail || submitting) return;
        setSubmitting(true);
        try {
            await onSubmit({ email: selectedEmail, role: selectedRole });
        } finally {
            setSubmitting(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === backdropRef.current) onClose();
    };

    const roles: {
        key: ProjectRole;
        icon: typeof ShieldCheck;
        disabled: boolean;
        permissions: string[];
    }[] = [
        {
            key: 'admin',
            icon: ShieldCheck,
            disabled: !isWorkspaceOwner,
            permissions: [
                t('settings.projects.modal.perm.adminMembers', 'Add and remove project members'),
                t('settings.projects.modal.perm.adminAgents', 'Full control over agents and deployments'),
                t('settings.projects.modal.perm.adminResources', 'Manage all project resources and settings'),
                t('settings.projects.modal.perm.adminRoles', 'Change member roles within the project'),
            ],
        },
        {
            key: 'contributor',
            icon: Pencil,
            disabled: false,
            permissions: [
                t('settings.projects.modal.perm.contribAgents', 'Create, edit, and deploy agents'),
                t('settings.projects.modal.perm.contribResources', 'Manage resources (MCP, memory, guardrails)'),
                t('settings.projects.modal.perm.contribPrompts', 'Create and edit prompts'),
                t('settings.projects.modal.perm.contribNoAdmin', 'Cannot manage members or project settings'),
            ],
        },
        {
            key: 'reader',
            icon: Eye,
            disabled: false,
            permissions: [
                t('settings.projects.modal.perm.readerAgents', 'View agents and their configurations'),
                t('settings.projects.modal.perm.readerResources', 'View resources and integrations'),
                t('settings.projects.modal.perm.readerLogs', 'View observability data and logs'),
                t('settings.projects.modal.perm.readerNoEdit', 'Cannot create or modify resources'),
            ],
        },
    ];

    return (
        <Backdrop ref={backdropRef} onClick={handleBackdropClick}>
            <Modal>
                <Header>
                    <Title>{t('settings.projects.modal.title', 'Add project member')}</Title>
                    <CloseButton onClick={onClose}>
                        <X size={16} />
                    </CloseButton>
                </Header>

                <Body>
                    <FieldLabel>
                        {t('settings.projects.modal.selectMember', 'Select a workspace member')}
                    </FieldLabel>
                    <SearchWrap>
                        <SearchIcon>
                            <Search size={14} />
                        </SearchIcon>
                        <SearchInput
                            type="text"
                            placeholder={t('settings.projects.modal.searchPlaceholder', 'Search by name or email...')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </SearchWrap>

                    <MemberList>
                        {loadingMembers ? (
                            <EmptyState>{t('common.loading', 'Loading...')}</EmptyState>
                        ) : availableMembers.length === 0 ? (
                            <EmptyState>
                                {search
                                    ? t('settings.projects.modal.noResults', 'No matching members')
                                    : t('settings.projects.modal.allAssigned', 'All workspace members are already in this project')}
                            </EmptyState>
                        ) : (
                            availableMembers.map((member) => (
                                <MemberRow
                                    key={member.id}
                                    $selected={selectedEmail === member.email}
                                    onClick={() => setSelectedEmail(member.email)}
                                >
                                    <MemberAvatar>
                                        {(member.name ?? member.email).charAt(0).toUpperCase()}
                                    </MemberAvatar>
                                    <MemberInfo>
                                        <MemberName>
                                            {member.name || member.email}
                                        </MemberName>
                                        {member.name && (
                                            <MemberEmail>{member.email}</MemberEmail>
                                        )}
                                    </MemberInfo>
                                    <CheckCircle $selected={selectedEmail === member.email}>
                                        {selectedEmail === member.email && <Check size={10} />}
                                    </CheckCircle>
                                </MemberRow>
                            ))
                        )}
                    </MemberList>

                    <FieldLabel>
                        {t('settings.projects.modal.roleLabel', 'Select a role')}
                    </FieldLabel>
                    <RoleGrid>
                        {roles.map(({ key, icon: Icon, disabled, permissions }) => (
                            <RoleCard
                                key={key}
                                $selected={selectedRole === key}
                                $disabled={disabled}
                                onClick={() => {
                                    if (!disabled) setSelectedRole(key);
                                }}
                            >
                                <RoleHeader>
                                    <RoleIconWrap $selected={selectedRole === key}>
                                        <Icon size={16} />
                                    </RoleIconWrap>
                                    <RoleName>
                                        {t(`settings.projects.modal.role.${key}`, key)}
                                    </RoleName>
                                    {disabled && (
                                        <DisabledTag>
                                            {t('settings.projects.modal.ownerOnly', 'Owner only')}
                                        </DisabledTag>
                                    )}
                                    {selectedRole === key && !disabled && (
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
                </Body>

                <Footer>
                    <CancelButton onClick={onClose}>
                        {t('common.cancel', 'Cancel')}
                    </CancelButton>
                    <SubmitButton
                        onClick={handleSubmit}
                        disabled={!selectedEmail || submitting}
                    >
                        {submitting
                            ? t('common.sending', 'Sending...')
                            : t('settings.projects.modal.submit', 'Add member')}
                    </SubmitButton>
                </Footer>
            </Modal>
        </Backdrop>
    );
};

export default InviteProjectMemberModal;

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
    width: 520px;
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

const SearchWrap = styled.div`
    position: relative;
    margin-bottom: 4px;
`;

const SearchIcon = styled.div`
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: hsl(var(--muted-foreground));
    pointer-events: none;
    display: flex;
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 10px 12px 10px 34px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: var(--overlay-subtle);
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: inherit;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.15);
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const MemberList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 180px;
    overflow-y: auto;
    margin-bottom: 4px;
`;

const EmptyState = styled.div`
    padding: 16px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
`;

const MemberRow = styled.button<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 9px;
    border: 1.5px solid ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'var(--border-subtle)'};
    background: ${({ $selected }) =>
        $selected ? 'hsla(var(--primary) / 0.05)' : 'var(--overlay-subtle)'};
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    width: 100%;
    transition: border-color 150ms ease, background 150ms ease;

    &:hover {
        border-color: ${({ $selected }) =>
            $selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
    }
`;

const MemberAvatar = styled.div`
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: hsla(var(--primary) / 0.12);
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
`;

const MemberInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
`;

const MemberName = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const MemberEmail = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

const RoleGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 2px;
`;

const RoleCard = styled.button<{ $selected: boolean; $disabled: boolean }>`
    background: ${({ $selected }) =>
        $selected ? 'hsla(var(--primary) / 0.06)' : 'var(--overlay-subtle)'};
    border: 1.5px solid ${({ $selected }) =>
        $selected ? 'hsl(var(--primary))' : 'var(--border-subtle)'};
    border-radius: 10px;
    padding: 14px 16px;
    text-align: left;
    cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
    opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
    transition: border-color 150ms ease, background 150ms ease;
    font-family: inherit;
    width: 100%;

    &:hover {
        border-color: ${({ $selected, $disabled }) =>
            $disabled ? 'var(--border-subtle)' : $selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
        background: ${({ $selected, $disabled }) =>
            $disabled ? 'var(--overlay-subtle)' : $selected ? 'hsla(var(--primary) / 0.08)' : 'var(--overlay-light)'};
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

const DisabledTag = styled.span`
    margin-left: auto;
    font-size: 10px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    background: var(--overlay-light);
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
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
