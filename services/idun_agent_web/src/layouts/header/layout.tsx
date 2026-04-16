import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { ChevronDown } from 'lucide-react';
import useWorkspace from '../../hooks/use-workspace';
import { useProject } from '../../hooks/use-project';
import type { WorkspaceSummary } from '../../utils/auth';
import WorkspacePopover from '../../components/header/workspace-popover/component';
import ProjectPopover from '../../components/header/project-popover/component';
import { getGradientForName } from '../../utils/workspace-colors';

const Header = () => {
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

    const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [showWorkspacePopover, setShowWorkspacePopover] = useState(false);
    const [showProjectPopover, setShowProjectPopover] = useState(false);

    useEffect(() => {
        getAllWorkspace().then(setAllWorkspaces).catch(() => {});
    }, [getAllWorkspace]);

    const toggleWorkspace = () => {
        setShowWorkspacePopover((prev) => !prev);
        setShowProjectPopover(false);
    };

    const toggleProject = () => {
        setShowProjectPopover((prev) => !prev);
        setShowWorkspacePopover(false);
    };

    const handleWorkspaceSelect = (workspaceId: string) => {
        setSelectedWorkspaceId(workspaceId);
        setShowWorkspacePopover(false);
    };

    const handleProjectSelect = (projectId: string) => {
        setSelectedProjectId(projectId);
        setShowProjectPopover(false);
    };

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

                </SelectorGroup>

                {currentRole && (
                    <>
                        <VerticalDivider />
                        <RoleBadge>{currentRole}</RoleBadge>
                    </>
                )}
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
    color: hsl(var(--primary-foreground));
    flex-shrink: 0;
`;

const SlashSeparator = styled.span`
    font-size: 16px;
    color: var(--border-subtle);
    font-weight: 300;
    margin: 0 6px;
    user-select: none;
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

