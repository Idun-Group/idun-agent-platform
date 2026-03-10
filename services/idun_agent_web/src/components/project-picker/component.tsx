import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { ChevronDown, Check, Search, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../hooks/use-project';

const ProjectPickerDropdown = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { projects, selectedProjectId, setSelectedProjectId, canAccessSettings } =
        useProject();

    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const filterInputRef = useRef<HTMLInputElement>(null);

    const selectedProject = projects.find((p) => p.id === selectedProjectId);

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

    return (
        <Container ref={containerRef}>
            <BreadcrumbLabel>{t('header.project.label', 'Project')}</BreadcrumbLabel>
            <Separator>/</Separator>
            <Trigger $isOpen={open} onClick={() => setOpen((prev) => !prev)}>
                <TriggerName>
                    {selectedProject?.name ?? '—'}
                </TriggerName>
                <ChevronDown
                    size={12}
                    style={{
                        transition: 'transform 150ms ease',
                        transform: open ? 'rotate(180deg)' : 'none',
                    }}
                />
            </Trigger>

            {open && (
                <Dropdown>
                    <FilterWrapper>
                        <FilterRow>
                            <Search size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
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
                                    <CheckSlot>
                                        {isSelected && (
                                            <Check size={14} color="hsl(var(--primary))" />
                                        )}
                                    </CheckSlot>
                                    <ProjectName $isSelected={isSelected}>
                                        {project.name}
                                    </ProjectName>
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
                                <Settings size={13} />
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
    gap: 0;
    position: relative;
`;

const BreadcrumbLabel = styled.span`
    color: hsl(var(--muted-foreground));
    font-size: 12.5px;
    font-weight: 500;
    letter-spacing: 0.02em;
`;

const Separator = styled.span`
    color: hsl(var(--muted-foreground) / 0.4);
    font-size: 13px;
    margin: 0 7px;
`;

const Trigger = styled.button<{ $isOpen: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 7px;
    cursor: pointer;
    transition: all 150ms ease;
    background: ${({ $isOpen }) =>
        $isOpen ? 'hsla(var(--primary) / 0.12)' : 'var(--overlay-subtle)'};
    border: 1px solid ${({ $isOpen }) =>
        $isOpen ? 'hsla(var(--primary) / 0.3)' : 'var(--border-light)'};
    color: hsl(var(--foreground));
    font-family: inherit;

    &:hover {
        background: ${({ $isOpen }) =>
            $isOpen ? 'hsla(var(--primary) / 0.12)' : 'var(--overlay-light)'};
        border-color: ${({ $isOpen }) =>
            $isOpen ? 'hsla(var(--primary) / 0.3)' : 'var(--overlay-strong)'};
    }
`;

const TriggerName = styled.span`
    font-size: 13px;
    font-weight: 500;
`;

const Dropdown = styled.div`
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 240px;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    z-index: 100;
    animation: ${dropdownIn} 150ms ease;
`;

const FilterWrapper = styled.div`
    padding: 10px 12px 8px;
`;

const FilterRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 6px;
`;

const FilterInput = styled.input`
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-family: inherit;

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

const ProjectList = styled.div`
    padding: 0 6px 4px;
    max-height: 240px;
    overflow-y: auto;
`;

const ProjectItem = styled.button<{ $isSelected: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 6px;
    background: ${({ $isSelected }) =>
        $isSelected ? 'hsla(var(--primary) / 0.1)' : 'transparent'};
    cursor: pointer;
    font-family: inherit;
    transition: background 100ms ease;
    text-align: left;

    &:hover {
        background: ${({ $isSelected }) =>
            $isSelected ? 'hsla(var(--primary) / 0.1)' : 'var(--overlay-subtle)'};
    }
`;

const CheckSlot = styled.span`
    width: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ProjectName = styled.span<{ $isSelected: boolean }>`
    font-size: 13px;
    font-weight: ${({ $isSelected }) => ($isSelected ? '500' : '400')};
    color: ${({ $isSelected }) =>
        $isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'};
`;

const DefaultBadge = styled.span`
    margin-left: auto;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: hsla(var(--primary) / 0.15);
    color: hsl(var(--primary));
    font-weight: 500;
`;

const EmptyText = styled.p`
    padding: 12px 10px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    margin: 0;
`;

const ManageSection = styled.div`
    border-top: 1px solid var(--border-subtle);
    padding: 8px 12px;
`;

const ManageLink = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    font-size: 12px;
    font-family: inherit;
    width: 100%;
    transition: all 100ms ease;

    &:hover {
        background: var(--overlay-subtle);
        color: hsl(var(--foreground));
    }
`;
