import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { ChevronDown } from 'lucide-react';
import useWorkspace from '../../hooks/use-workspace';
import { useProject } from '../../hooks/use-project';
import type { WorkspaceSummary } from '../../utils/auth';
import WorkspacePopover from '../../components/header/workspace-popover/component';
import ProjectPopover from '../../components/header/project-popover/component';

const Header = () => {
    const { t } = useTranslation();
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
                    <WorkspaceTrigger onClick={toggleWorkspace} $open={showWorkspacePopover}>
                        <TriggerLabel>{t('header.workspace.label', 'Workspace')}</TriggerLabel>
                        <TriggerValue>
                            <TriggerValueText>{workspaceName}</TriggerValueText>
                            <ChevronDown size={12} />
                        </TriggerValue>
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

                    <ProjectTrigger onClick={toggleProject} $open={showProjectPopover}>
                        <TriggerLabel>{t('header.project.label', 'Project')}</TriggerLabel>
                        <TriggerValue>
                            <TriggerValueText>{projectName}</TriggerValueText>
                            <ChevronDown size={12} />
                        </TriggerValue>
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

const TriggerButton = styled.button<{ $open?: boolean }>`
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 40px;
    padding: 6px 14px;
    border-radius: 8px;
    background: ${({ $open }) => ($open ? 'var(--overlay-medium)' : 'var(--overlay-subtle)')};
    border: 1px solid
        ${({ $open }) =>
            $open ? 'hsla(var(--primary) / 0.4)' : 'var(--border-subtle)'};
    cursor: pointer;
    position: relative;
    font-family: inherit;
    color: hsl(var(--foreground));
    transition: background 150ms ease, border-color 150ms ease;

    svg {
        color: ${({ $open }) =>
            $open ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
        transition: color 150ms ease, transform 150ms ease;
        transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
    }

    &:hover {
        background: ${({ $open }) => ($open ? 'var(--overlay-medium)' : 'var(--overlay-light)')};
        border-color: ${({ $open }) =>
            $open ? 'hsla(var(--primary) / 0.4)' : 'var(--border-light)'};
    }

    &:focus-visible {
        outline: none;
        border-color: hsla(var(--primary) / 0.5);
        box-shadow: 0 0 0 3px hsla(var(--primary) / 0.18);
    }
`;

const TriggerLabel = styled.span`
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: hsl(var(--primary));
    line-height: 1;
    user-select: none;
`;

const TriggerValue = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    line-height: 1;

    svg {
        flex-shrink: 0;
    }
`;

const TriggerValueText = styled.span`
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
`;

const WorkspaceTrigger = styled(TriggerButton)``;

const ProjectTrigger = styled(TriggerButton)``;

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

