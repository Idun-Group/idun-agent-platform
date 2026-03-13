import { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import { useAuth } from '../../hooks/use-auth';
import { getJson } from '../../utils/api';

type WorkspaceInfo = {
    id: string;
    name: string;
    slug: string;
};

const WorkspaceSwitcher = () => {
    const { session, refresh } = useAuth();
    const [open, setOpen] = useState(false);
    const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
    const ref = useRef<HTMLDivElement>(null);

    const activeId =
        typeof window !== 'undefined' ? localStorage.getItem('activeTenantId') : null;
    const ownerIds = session?.principal?.owner_workspace_ids ?? [];
    const current = workspaces.find((w) => w.id === activeId);

    useEffect(() => {
        if (!session) return;
        let cancelled = false;
        (async () => {
            try {
                const data = await getJson<WorkspaceInfo[]>('/api/v1/workspaces/');
                if (!cancelled) setWorkspaces(data);
            } catch {
                // ignore
            }
        })();
        return () => { cancelled = true; };
    }, [session]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const switchTo = useCallback(async (wsId: string) => {
        if (wsId === activeId) {
            setOpen(false);
            return;
        }
        localStorage.setItem('activeTenantId', wsId);
        // Clear project selection for new workspace
        localStorage.removeItem('activeProjectId');
        setOpen(false);
        // Refresh session to pick up new workspace context
        await refresh();
        // Force re-render of data-dependent components
        window.dispatchEvent(new StorageEvent('storage', { key: 'activeTenantId', newValue: wsId }));
    }, [activeId, refresh]);

    if (!session || workspaces.length <= 1) {
        // Single workspace — show static name
        return (
            <TriggerStatic>
                <Building2 size={14} />
                <TriggerName>{current?.name ?? '...'}</TriggerName>
            </TriggerStatic>
        );
    }

    return (
        <Container ref={ref}>
            <Trigger onClick={() => setOpen((v) => !v)}>
                <TriggerIcon>{(current?.name ?? '?').charAt(0).toUpperCase()}</TriggerIcon>
                <TriggerName>{current?.name ?? '...'}</TriggerName>
                <ChevronDown size={12} style={{ opacity: 0.5 }} />
            </Trigger>

            {open && (
                <Dropdown>
                    {workspaces.map((ws) => {
                        const isCurrent = ws.id === activeId;
                        const isOwner = ownerIds.includes(ws.id);
                        return (
                            <DropdownItem
                                key={ws.id}
                                $active={isCurrent}
                                onClick={() => switchTo(ws.id)}
                            >
                                <ItemLeft>
                                    <ItemIcon $active={isCurrent}>
                                        {ws.name.charAt(0).toUpperCase()}
                                    </ItemIcon>
                                    <ItemName>{ws.name}</ItemName>
                                </ItemLeft>
                                <ItemRight>
                                    <ItemRole $isOwner={isOwner}>
                                        {isOwner ? 'Owner' : 'Member'}
                                    </ItemRole>
                                    {isCurrent && <Check size={14} color="hsl(var(--primary))" />}
                                </ItemRight>
                            </DropdownItem>
                        );
                    })}
                </Dropdown>
            )}
        </Container>
    );
};

export default WorkspaceSwitcher;

// Styled components
const Container = styled.div`
    position: relative;
`;

const Trigger = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 7px;
    background: transparent;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms;

    &:hover {
        border-color: var(--border-light);
        background: var(--overlay-subtle);
    }
`;

const TriggerStatic = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
    padding: 5px 0;
`;

const TriggerIcon = styled.div`
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: hsla(var(--primary) / 0.15);
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
`;

const TriggerName = styled.span`
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const Dropdown = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 260px;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
    padding: 6px;
    z-index: 100;
`;

const DropdownItem = styled.button<{ $active: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 12px;
    border-radius: 7px;
    border: none;
    background: ${({ $active }) => ($active ? 'hsla(var(--primary) / 0.1)' : 'transparent')};
    color: hsl(var(--foreground));
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    text-align: left;
    transition: background 100ms;

    &:hover {
        background: ${({ $active }) =>
            $active ? 'hsla(var(--primary) / 0.1)' : 'var(--overlay-subtle)'};
    }
`;

const ItemLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const ItemIcon = styled.div<{ $active: boolean }>`
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: ${({ $active }) =>
        $active ? 'hsla(var(--primary) / 0.15)' : 'var(--overlay-subtle)'};
    color: ${({ $active }) =>
        $active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
`;

const ItemName = styled.span`
    font-weight: 500;
`;

const ItemRight = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ItemRole = styled.span<{ $isOwner: boolean }>`
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 500;
    background: ${({ $isOwner }) =>
        $isOwner ? 'hsla(var(--warning) / 0.12)' : 'rgba(59, 130, 246, 0.12)'};
    color: ${({ $isOwner }) =>
        $isOwner ? 'hsl(var(--warning))' : '#60a5fa'};
`;
