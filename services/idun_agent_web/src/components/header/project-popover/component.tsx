import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import type { ProjectSummary } from '../../../hooks/use-project';

type ProjectPopoverProps = {
    projects: ProjectSummary[];
    selectedProjectId: string | null;
    onSelect: (projectId: string) => void;
    onClose: () => void;
    isWorkspaceOwner: boolean;
};

const ProjectPopover = ({
    projects,
    selectedProjectId,
    onSelect,
    onClose,
    isWorkspaceOwner,
}: ProjectPopoverProps) => {
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    return (
        <PopoverContainer ref={ref}>
            <ProjectList>
                {projects.length === 0 && (
                    <EmptyState>No projects found</EmptyState>
                )}
                {projects.map((project) => {
                    const isActive = project.id === selectedProjectId;

                    return (
                        <ProjectItem
                            key={project.id}
                            $active={isActive}
                            onClick={() => {
                                onSelect(project.id);
                                onClose();
                            }}
                        >
                            <ProjectMeta>
                                <ProjectNameRow>
                                    <ProjectName>{project.name}</ProjectName>
                                    {project.is_default && (
                                        <DefaultBadge>Default</DefaultBadge>
                                    )}
                                </ProjectNameRow>
                                {project.current_user_role && (
                                    <RoleBadge>{project.current_user_role}</RoleBadge>
                                )}
                            </ProjectMeta>
                            {isActive && (
                                <CheckIcon>
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                        <path
                                            d="M3 8L6.5 11.5L13 5"
                                            stroke="currentColor"
                                            strokeWidth="1.75"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </CheckIcon>
                            )}
                        </ProjectItem>
                    );
                })}
            </ProjectList>

            {isWorkspaceOwner && (
                <PopoverFooter>
                    <CreateProjectLink
                        onClick={() => {
                            onClose();
                            navigate('/settings/workspace-projects');
                        }}
                    >
                        <PlusIcon>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M8 2V14M2 8H14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                            </svg>
                        </PlusIcon>
                        Create project
                    </CreateProjectLink>
                </PopoverFooter>
            )}
        </PopoverContainer>
    );
};

export default ProjectPopover;

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const popoverIn = keyframes`
    from {
        opacity: 0;
        transform: translateY(6px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
`;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const PopoverContainer = styled.div`
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 220px;
    z-index: 50;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    animation: ${popoverIn} 150ms ease;
    overflow: hidden;
`;

const ProjectList = styled.div`
    padding: 4px 8px;
    max-height: 240px;
    overflow-y: auto;

    &::-webkit-scrollbar {
        width: 4px;
    }

    &::-webkit-scrollbar-track {
        background: transparent;
    }

    &::-webkit-scrollbar-thumb {
        background: var(--border-subtle);
        border-radius: 2px;
    }
`;

const ProjectItem = styled.button<{ $active?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: 6px;
    background: ${({ $active }) =>
        $active ? 'hsla(var(--primary) / 0.10)' : 'transparent'};
    color: hsl(var(--foreground));
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 150ms ease;

    &:hover {
        background: ${({ $active }) =>
            $active ? 'hsla(var(--primary) / 0.15)' : 'var(--overlay-light)'};
    }
`;

const ProjectMeta = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    gap: 2px;
`;

const ProjectNameRow = styled.div`
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
`;

const ProjectName = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const DefaultBadge = styled.span`
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    background: var(--overlay-light, hsla(0, 0%, 100%, 0.06));
    border: 1px solid var(--border-subtle);
    border-radius: 3px;
    padding: 1px 4px;
    line-height: 1.4;
`;

const RoleBadge = styled.span`
    font-size: 9px;
    font-weight: 500;
    color: hsl(var(--primary));
    text-transform: capitalize;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const CheckIcon = styled.span`
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: hsl(var(--primary));
`;

const EmptyState = styled.p`
    text-align: center;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    padding: 12px 0;
    margin: 0;
`;

const PopoverFooter = styled.div`
    border-top: 1px solid var(--border-subtle);
    padding: 8px;
`;

const CreateProjectLink = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: hsl(var(--primary));
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
        background: hsla(var(--primary) / 0.08);
    }
`;

const PlusIcon = styled.span`
    display: flex;
    align-items: center;
    flex-shrink: 0;
`;
