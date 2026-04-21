import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled, { keyframes } from 'styled-components';
import type { WorkspaceSummary } from '../../../utils/auth';
import { getGradientForName } from '../../../utils/workspace-colors';

const WorkspacePopover = ({
    workspaces,
    selectedWorkspaceId,
    onSelect,
    onClose,
}: WorkspacePopoverProps) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const filtered = workspaces.filter((ws) =>
        ws.name.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <PopoverContainer ref={ref}>
            <SearchWrapper>
                <SearchInputWrapper>
                    <SearchIcon>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </SearchIcon>
                    <SearchInput
                        type="text"
                        placeholder={t('header.workspace.search', 'Search workspaces...')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </SearchInputWrapper>
            </SearchWrapper>

            <WorkspaceList>
                {filtered.length === 0 && (
                    <EmptyState>{t('header.workspace.empty', 'No workspaces found')}</EmptyState>
                )}
                {filtered.map((ws) => {
                    const isActive = ws.id === selectedWorkspaceId;
                    const initial = ws.name.charAt(0).toUpperCase();
                    const gradient = getGradientForName(ws.name);
                    const subtitle = ws.is_owner ? 'Owner' : 'Member';

                    return (
                        <WorkspaceItem
                            key={ws.id}
                            $active={isActive}
                            onClick={() => {
                                onSelect(ws.id);
                                onClose();
                            }}
                        >
                            <WorkspaceIcon style={{ background: gradient }}>
                                {initial}
                            </WorkspaceIcon>
                            <WorkspaceMeta>
                                <WorkspaceName>{ws.name}</WorkspaceName>
                                <WorkspaceSubtitle>{subtitle}</WorkspaceSubtitle>
                            </WorkspaceMeta>
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
                        </WorkspaceItem>
                    );
                })}
            </WorkspaceList>

            <PopoverFooter>
                <CreateWorkspaceLink
                    onClick={() => {
                        onClose();
                        navigate('/workspaces/new');
                    }}
                >
                    <PlusIcon>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M8 2V14M2 8H14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                        </svg>
                    </PlusIcon>
                    {t('header.workspace.create', 'Create workspace')}
                </CreateWorkspaceLink>
            </PopoverFooter>
        </PopoverContainer>
    );
};

export default WorkspacePopover;

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
    width: 260px;
    z-index: 50;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    animation: ${popoverIn} 150ms ease;
    overflow: hidden;
`;

const SearchWrapper = styled.div`
    padding: 8px;
    border-bottom: 1px solid var(--border-subtle);
`;

const SearchInputWrapper = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

const SearchIcon = styled.span`
    position: absolute;
    left: 8px;
    color: hsl(var(--muted-foreground));
    display: flex;
    align-items: center;
    pointer-events: none;
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 6px 8px 6px 28px;
    background: var(--overlay-light, hsla(0, 0%, 100%, 0.05));
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-family: inherit;
    outline: none;
    transition: border-color 150ms ease;
    box-sizing: border-box;

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }

    &:focus {
        border-color: hsl(var(--primary));
    }
`;

const WorkspaceList = styled.div`
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

const WorkspaceItem = styled.button<{ $active?: boolean }>`
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

const WorkspaceIcon = styled.div`
    width: 22px;
    height: 22px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: hsl(var(--primary-foreground));
    flex-shrink: 0;
    letter-spacing: 0;
`;

const WorkspaceMeta = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
`;

const WorkspaceName = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const WorkspaceSubtitle = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
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

const CreateWorkspaceLink = styled.button`
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
