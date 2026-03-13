import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { ChevronDown, Check, Search, Settings, Grid3X3, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../hooks/use-project';
import { getJson } from '../../utils/api';

type Workspace = { id: string; name: string };

const ProjectPickerDropdown = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { projects, selectedProjectId, setSelectedProjectId, canAccessSettings } =
        useProject();

    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const [workspaceName, setWorkspaceName] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const filterInputRef = useRef<HTMLInputElement>(null);

    const selectedProject = projects.find((p) => p.id === selectedProjectId);

    // Fetch workspace name once
    useEffect(() => {
        let cancelled = false;
        getJson<Workspace[]>('/api/v1/workspaces/')
            .then((ws) => {
                if (!cancelled && ws.length > 0) {
                    const activeId =
                        typeof window !== 'undefined'
                            ? localStorage.getItem('activeTenantId')
                            : null;
                    const active = ws.find((w) => w.id === activeId) ?? ws[0];
                    setWorkspaceName(active.name);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setFilter('');
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    // Focus filter input when dropdown opens
    useEffect(() => {
        if (open && filterInputRef.current) {
            filterInputRef.current.focus();
        }
    }, [open]);

    const handleSelect = useCallback(
        (projectId: string) => {
            setSelectedProjectId(projectId);
            setOpen(false);
            setFilter('');
        },
        [setSelectedProjectId],
    );

    const handleManage = useCallback(() => {
        setOpen(false);
        setFilter('');
        navigate('/settings/workspace-projects');
    }, [navigate]);

    const filtered = filter
        ? projects.filter((p) =>
              p.name.toLowerCase().includes(filter.toLowerCase()),
          )
        : projects;

    const wsInitial = workspaceName ? workspaceName.charAt(0).toUpperCase() : '—';

    return (
        <Container ref={containerRef}>
            {/* Workspace segment (static) */}
            <WorkspaceSegment>
                <WsIcon>
                    <Building2 size={13} />
                </WsIcon>
                <WsName>{workspaceName || '...'}</WsName>
            </WorkspaceSegment>

            <BreadcrumbSep>/</BreadcrumbSep>

            {/* Project segment (clickable) */}
            <ProjectTrigger $isOpen={open} onClick={() => setOpen((prev) => !prev)}>
                <ProjIcon>
                    <Grid3X3 size={12} />
                </ProjIcon>
                <ProjName>{selectedProject?.name ?? '—'}</ProjName>
                <TriggerChevron
                    size={13}
                    style={{
                        transition: 'transform 150ms ease',
                        transform: open ? 'rotate(180deg)' : 'none',
                    }}
                />
            </ProjectTrigger>

            {open && (
                <Dropdown>
                    <FilterWrapper>
                        <FilterRow>
                            <Search size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <FilterInput
                                ref={filterInputRef}
                                type="text"
                                placeholder={t('header.project.filter', 'Filter projects...')}
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                            />
                        </FilterRow>
                    </FilterWrapper>

                    <ProjectList>
                        {filtered.map((project) => {
                            const isSelected = project.id === selectedProjectId;
                            return (
                                <ProjectItem
                                    key={project.id}
                                    $isSelected={isSelected}
                                    onClick={() => handleSelect(project.id)}
                                >
                                    <ItemIcon $isSelected={isSelected}>
                                        <Grid3X3 size={13} />
                                    </ItemIcon>
                                    <ProjectItemName $isSelected={isSelected}>
                                        {project.name}
                                    </ProjectItemName>
                                    {project.is_default && (
                                        <DefaultBadge>
                                            {t('projects.default', 'Default')}
                                        </DefaultBadge>
                                    )}
                                </ProjectItem>
                            );
                        })}
                        {filtered.length === 0 && (
                            <EmptyText>
                                {t('projects.noProjects', 'No projects found.')}
                            </EmptyText>
                        )}
                    </ProjectList>

                    {canAccessSettings && (
                        <ManageSection>
                            <ManageLink onClick={handleManage}>
                                <Settings size={14} />
                                <span>{t('header.project.manage', 'Manage projects')}</span>
                            </ManageLink>
                        </ManageSection>
                    )}
                </Dropdown>
            )}
        </Container>
    );
};

export default ProjectPickerDropdown;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const dropdownIn = keyframes`
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
    display: flex;
    align-items: center;
    gap: 3px;
    position: relative;
`;

// -- Workspace segment (static) --

const WorkspaceSegment = styled.div`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
`;

const WsIcon = styled.div`
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: linear-gradient(135deg, hsla(var(--primary) / 0.7), hsla(var(--primary) / 0.3));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: hsl(var(--primary-foreground));
`;

const WsName = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
`;

const BreadcrumbSep = styled.span`
    color: hsl(var(--muted-foreground) / 0.35);
    font-size: 16px;
    margin: 0 2px;
    user-select: none;
`;

// -- Project trigger (clickable) --

const ProjectTrigger = styled.button<{ $isOpen: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-radius: 9px;
    cursor: pointer;
    transition: all 180ms ease;
    font-family: inherit;
    background: ${({ $isOpen }) =>
        $isOpen ? 'hsla(var(--primary) / 0.12)' : 'transparent'};
    border: 1px solid ${({ $isOpen }) =>
        $isOpen ? 'hsla(var(--primary) / 0.2)' : 'transparent'};
    color: hsl(var(--foreground));

    &:hover {
        background: ${({ $isOpen }) =>
            $isOpen ? 'hsla(var(--primary) / 0.12)' : 'var(--overlay-subtle)'};
        border-color: ${({ $isOpen }) =>
            $isOpen ? 'hsla(var(--primary) / 0.2)' : 'var(--border-light)'};
    }
`;

const ProjIcon = styled.div`
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: hsla(var(--primary) / 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: hsl(var(--primary));
`;

const ProjName = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    white-space: nowrap;
`;

const TriggerChevron = styled(ChevronDown)`
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
`;

// -- Dropdown --

const Dropdown = styled.div`
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 300px;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03);
    overflow: hidden;
    z-index: 100;
    animation: ${dropdownIn} 150ms ease;
`;

const FilterWrapper = styled.div`
    padding: 12px 14px 10px;
`;

const FilterRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
`;

const FilterInput = styled.input`
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-family: inherit;

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const ProjectList = styled.div`
    padding: 4px 8px 8px;
    max-height: 280px;
    overflow-y: auto;
`;

const ProjectItem = styled.button<{ $isSelected: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border-radius: 8px;
    background: ${({ $isSelected }) =>
        $isSelected ? 'hsla(var(--primary) / 0.1)' : 'transparent'};
    cursor: pointer;
    font-family: inherit;
    transition: background 100ms ease;
    text-align: left;
    border: none;

    &:hover {
        background: ${({ $isSelected }) =>
            $isSelected ? 'hsla(var(--primary) / 0.1)' : 'var(--overlay-subtle)'};
    }
`;

const ItemIcon = styled.div<{ $isSelected: boolean }>`
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: ${({ $isSelected }) =>
        $isSelected ? 'hsla(var(--primary) / 0.2)' : 'var(--overlay-subtle)'};
    color: ${({ $isSelected }) =>
        $isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
`;

const ProjectItemName = styled.span<{ $isSelected: boolean }>`
    font-size: 14px;
    font-weight: ${({ $isSelected }) => ($isSelected ? '600' : '400')};
    color: ${({ $isSelected }) =>
        $isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'};
    flex: 1;
`;

const DefaultBadge = styled.span`
    margin-left: auto;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    background: hsla(var(--primary) / 0.15);
    color: hsl(var(--primary));
    font-weight: 500;
`;

const EmptyText = styled.p`
    padding: 14px 10px;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    margin: 0;
`;

const ManageSection = styled.div`
    border-top: 1px solid var(--border-subtle);
    padding: 10px 14px;
`;

const ManageLink = styled.button`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    font-family: inherit;
    width: 100%;
    transition: all 100ms ease;

    &:hover {
        background: var(--overlay-subtle);
        color: hsl(var(--foreground));
    }
`;
