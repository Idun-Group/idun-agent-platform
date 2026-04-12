import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Settings, ChevronDown } from 'lucide-react';
import useWorkspace from '../../hooks/use-workspace';
import { useProject } from '../../hooks/use-project';
import { useAuth } from '../../hooks/use-auth';
import type { WorkspaceSummary } from '../../utils/auth';
import WorkspacePopover from '../../components/header/workspace-popover/component';
import ProjectPopover from '../../components/header/project-popover/component';
import UserAvatarPopover from '../../components/header/user-avatar-popover/component';

const WORKSPACE_GRADIENTS = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
    'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #14b8a6 0%, #3b82f6 100%)',
];

function getGradientForName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    return WORKSPACE_GRADIENTS[hash % WORKSPACE_GRADIENTS.length];
}

const Header = () => {
    const navigate = useNavigate();

    const {
        selectedWorkspaceId,
        setSelectedWorkspaceId,
        currentWorkspace,
        isCurrentWorkspaceOwner,
        getAllWorkspace,
    } = useWorkspace();
    const {
        selectedProjectId,
        setSelectedProjectId,
        projects,
        currentProject,
        currentRole,
        isLoadingProjects,
    } = useProject();
    const { session } = useAuth();

    const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [showWorkspacePopover, setShowWorkspacePopover] = useState(false);
    const [showProjectPopover, setShowProjectPopover] = useState(false);
    const [showUserPopover, setShowUserPopover] = useState(false);

    useEffect(() => {
        getAllWorkspace().then(setAllWorkspaces).catch(() => {});
    }, [getAllWorkspace]);

    const toggleWorkspace = () => {
        setShowWorkspacePopover((prev) => !prev);
        setShowProjectPopover(false);
        setShowUserPopover(false);
    };

    const toggleProject = () => {
        setShowProjectPopover((prev) => !prev);
        setShowWorkspacePopover(false);
        setShowUserPopover(false);
    };

    const toggleUser = () => {
        setShowUserPopover((prev) => !prev);
        setShowWorkspacePopover(false);
        setShowProjectPopover(false);
    };

    const handleWorkspaceSelect = (workspaceId: string) => {
        setSelectedWorkspaceId(workspaceId);
        setShowWorkspacePopover(false);
    };

    const handleProjectSelect = (projectId: string) => {
        setSelectedProjectId(projectId);
        setShowProjectPopover(false);
    };

    const email = session?.principal?.email ?? '';
    const name =
        (session as any)?.principal?.name || email.split('@')[0] || 'User';
    const initials =
        name
            .split(' ')
            .map((w: string) => w.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'U';

    const workspaceName = currentWorkspace?.name ?? 'Workspace';
    const workspaceInitial = workspaceName.charAt(0).toUpperCase();
    const workspaceGradient = getGradientForName(workspaceName);

    const projectName = currentProject?.name ?? (isLoadingProjects ? '...' : 'Project');

    return (
        <HeaderContainer>
            <LeftSection>
                <LogoLink to="/agents">
                    <LogoIcon src="/img/logo/favicon.svg" alt="Idun Logo" />
                    <LogoText>Idun</LogoText>
                </LogoLink>
            </LeftSection>

            <Spacer />

            <RightSection>
                <SelectorGroup>
                    <WorkspaceTrigger onClick={toggleWorkspace}>
                        <WorkspaceIcon style={{ background: workspaceGradient }}>
                            {workspaceInitial}
                        </WorkspaceIcon>
                        <span>{workspaceName}</span>
                        <ChevronDown size={12} />
                        {showWorkspacePopover && (
                            <WorkspacePopover
                                workspaces={allWorkspaces}
                                selectedWorkspaceId={selectedWorkspaceId}
                                onSelect={handleWorkspaceSelect}
                                onClose={() => setShowWorkspacePopover(false)}
                            />
                        )}
                    </WorkspaceTrigger>

                    <SlashSeparator>/</SlashSeparator>

                    <ProjectTrigger onClick={toggleProject}>
                        <span>{projectName}</span>
                        <ChevronDown size={12} />
                        {showProjectPopover && (
                            <ProjectPopover
                                projects={projects}
                                selectedProjectId={selectedProjectId}
                                onSelect={handleProjectSelect}
                                onClose={() => setShowProjectPopover(false)}
                                isWorkspaceOwner={isCurrentWorkspaceOwner}
                            />
                        )}
                    </ProjectTrigger>

                    <GearButton onClick={() => navigate('/settings')}>
                        <Settings size={14} />
                    </GearButton>
                </SelectorGroup>

                <VerticalDivider />

                {currentRole && <RoleBadge>{currentRole}</RoleBadge>}

                <AvatarTrigger onClick={toggleUser}>
                    <AvatarCircle>{initials}</AvatarCircle>
                    {showUserPopover && (
                        <UserAvatarPopover onClose={() => setShowUserPopover(false)} />
                    )}
                </AvatarTrigger>
            </RightSection>
        </HeaderContainer>
    );
};

export default Header;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const HeaderContainer = styled.header`
    background-color: hsl(var(--header-bg) / 0.9);
    border-bottom: 1px solid hsl(var(--header-border));
    height: 52px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    flex-shrink: 0;
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 40;
    backdrop-filter: saturate(180%) blur(8px);
    transition: background-color 0.3s ease, border-color 0.3s ease;
    box-sizing: border-box;
`;

const LeftSection = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const LogoLink = styled(Link)`
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
`;

const LogoIcon = styled.img`
    height: 24px;
`;

const LogoText = styled.span`
    font-weight: 600;
    font-size: 14px;
    color: hsl(var(--foreground));
    opacity: 0.9;
`;

const Spacer = styled.div`
    flex: 1;
`;

const RightSection = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
`;

const SelectorGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 0;
`;

const TriggerButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 7px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    cursor: pointer;
    position: relative;
    font-family: inherit;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    transition: background 150ms ease;

    &:hover {
        background: var(--overlay-light);
    }
`;

const WorkspaceTrigger = styled(TriggerButton)``;

const ProjectTrigger = styled(TriggerButton)``;

const WorkspaceIcon = styled.div`
    width: 20px;
    height: 20px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
`;

const SlashSeparator = styled.span`
    font-size: 16px;
    color: var(--border-subtle);
    font-weight: 300;
    margin: 0 6px;
    user-select: none;
`;

const GearButton = styled.button`
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    background: transparent;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: background 150ms ease, color 150ms ease;
    margin-left: 6px;

    &:hover {
        background: var(--overlay-light);
        color: hsl(var(--foreground));
    }
`;

const VerticalDivider = styled.div`
    width: 1px;
    height: 24px;
    background: var(--border-subtle);
    margin: 0 2px;
`;

const RoleBadge = styled.span`
    border-radius: 999px;
    background: hsla(var(--primary) / 0.12);
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--primary));
    padding: 3px 8px;
`;

const AvatarTrigger = styled.div`
    position: relative;
    cursor: pointer;
`;

const AvatarCircle = styled.div`
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: hsl(var(--primary));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
`;
