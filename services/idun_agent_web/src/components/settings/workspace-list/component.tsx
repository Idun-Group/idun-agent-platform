import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Building2, Star, LogOut } from 'lucide-react';
import { notify } from '../../toast/notify';
import { useAuth } from '../../../hooks/use-auth';
import { getJson, patchJson, postJson } from '../../../utils/api';

type WorkspaceInfo = {
    id: string;
    name: string;
    slug: string;
};

const WorkspaceListTab = () => {
    const { t } = useTranslation();
    const { session, refresh } = useAuth();
    const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [leaving, setLeaving] = useState<string | null>(null);

    const activeId =
        typeof window !== 'undefined' ? localStorage.getItem('activeTenantId') : null;
    const defaultWsId = session?.principal?.default_workspace_id ?? null;
    const ownerIds = session?.principal?.owner_workspace_ids ?? [];

    const fetchWorkspaces = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getJson<WorkspaceInfo[]>('/api/v1/workspaces/');
            setWorkspaces(data);
        } catch {
            notify.error(t('settings.workspaces.list.fetchError', 'Failed to load workspaces'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    const handleSetDefault = async (wsId: string) => {
        try {
            await patchJson('/api/v1/auth/preferences', { default_workspace_id: wsId });
            await refresh();
            notify.success(t('settings.workspaces.list.defaultSet', 'Default workspace updated'));
        } catch {
            notify.error(t('settings.workspaces.list.defaultError', 'Failed to set default'));
        }
    };

    const handleLeave = async (wsId: string) => {
        try {
            await postJson(`/api/v1/workspaces/${wsId}/leave`, {});
            await refresh();
            fetchWorkspaces();
            // If we left the active workspace, switch to another
            if (wsId === activeId) {
                const remaining = workspaces.filter((w) => w.id !== wsId);
                if (remaining.length > 0) {
                    localStorage.setItem('activeTenantId', remaining[0].id);
                    window.dispatchEvent(
                        new StorageEvent('storage', { key: 'activeTenantId', newValue: remaining[0].id }),
                    );
                }
            }
            setLeaving(null);
            notify.success(t('settings.workspaces.list.left', 'You left the workspace'));
        } catch (err: unknown) {
            const raw = err instanceof Error ? err.message : '';
            let detail = '';
            try { detail = JSON.parse(raw).detail ?? ''; } catch { detail = raw; }
            notify.error(detail || t('settings.workspaces.list.leaveError', 'Failed to leave workspace'));
            setLeaving(null);
        }
    };

    if (loading) {
        return <LoadingText>{t('common.loading', 'Loading...')}</LoadingText>;
    }

    return (
        <Container>
            <HeaderSection>
                <PageTitle>{t('settings.workspaces.list.title', 'Workspaces')}</PageTitle>
                <PageDescription>
                    {t('settings.workspaces.list.description', 'Manage your workspace memberships and set your default.')}
                </PageDescription>
            </HeaderSection>

            <CardList>
                {workspaces.map((ws) => {
                    const isActive = ws.id === activeId;
                    const isDefault = ws.id === defaultWsId;
                    const isOwner = ownerIds.includes(ws.id);
                    const canLeave = !isOwner;

                    return (
                        <WsCard key={ws.id} $active={isActive}>
                            <WsCardLeft>
                                <WsCardIcon $active={isActive}>
                                    <Building2 size={18} />
                                </WsCardIcon>
                                <WsCardInfo>
                                    <WsCardNameRow>
                                        <WsCardName>{ws.name}</WsCardName>
                                        {isDefault && (
                                            <DefaultBadge>
                                                {t('settings.workspaces.list.default', 'Default')}
                                            </DefaultBadge>
                                        )}
                                    </WsCardNameRow>
                                    <WsCardMeta>
                                        <RoleBadge $isOwner={isOwner}>
                                            {isOwner ? 'Owner' : 'Member'}
                                        </RoleBadge>
                                        {isActive && (
                                            <ActiveDot>{t('settings.workspaces.list.active', 'Active')}</ActiveDot>
                                        )}
                                    </WsCardMeta>
                                </WsCardInfo>
                            </WsCardLeft>
                            <WsCardRight>
                                {!isDefault && (
                                    <ActionBtn onClick={() => handleSetDefault(ws.id)}>
                                        <Star size={14} />
                                        {t('settings.workspaces.list.setDefault', 'Set as default')}
                                    </ActionBtn>
                                )}
                                {canLeave && (
                                    <LeaveBtn onClick={() => setLeaving(ws.id)}>
                                        <LogOut size={14} />
                                        {t('settings.workspaces.list.leave', 'Leave')}
                                    </LeaveBtn>
                                )}
                            </WsCardRight>
                        </WsCard>
                    );
                })}
            </CardList>

            {/* Leave confirmation dialog */}
            {leaving && (() => {
                const ws = workspaces.find((w) => w.id === leaving);
                if (!ws) return null;
                return (
                    <Overlay onClick={() => setLeaving(null)}>
                        <Dialog onClick={(e) => e.stopPropagation()}>
                            <DialogTitle>
                                {t('settings.workspaces.list.leaveTitle', 'Leave {{name}}?', { name: ws.name })}
                            </DialogTitle>
                            <DialogText>
                                {t(
                                    'settings.workspaces.list.leaveMessage',
                                    "You'll lose access to all projects and resources in this workspace. You'll need to be re-invited to rejoin.",
                                )}
                            </DialogText>
                            <DialogActions>
                                <CancelBtn onClick={() => setLeaving(null)}>
                                    {t('common.cancel', 'Cancel')}
                                </CancelBtn>
                                <ConfirmLeaveBtn onClick={() => handleLeave(leaving)}>
                                    {t('settings.workspaces.list.confirmLeave', 'Leave workspace')}
                                </ConfirmLeaveBtn>
                            </DialogActions>
                        </Dialog>
                    </Overlay>
                );
            })()}
        </Container>
    );
};

export default WorkspaceListTab;

// Styled components
const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const HeaderSection = styled.div``;

const PageTitle = styled.h2`
    font-size: 18px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px 0;
`;

const PageDescription = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const LoadingText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    padding: 24px 0;
`;

const CardList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const WsCard = styled.div<{ $active: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: hsl(var(--card));
    border: 1px solid ${({ $active }) =>
        $active ? 'hsla(var(--primary) / 0.3)' : 'var(--border-subtle)'};
    border-radius: 10px;
    transition: border-color 150ms;
`;

const WsCardLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
`;

const WsCardIcon = styled.div<{ $active: boolean }>`
    width: 40px;
    height: 40px;
    border-radius: 9px;
    background: ${({ $active }) =>
        $active ? 'hsla(var(--primary) / 0.12)' : 'var(--overlay-subtle)'};
    color: ${({ $active }) =>
        $active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'};
    display: flex;
    align-items: center;
    justify-content: center;
`;

const WsCardInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const WsCardNameRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const WsCardName = styled.span`
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--foreground));
`;

const DefaultBadge = styled.span`
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 3px;
    background: hsla(var(--primary) / 0.12);
    color: hsl(var(--primary));
    font-weight: 500;
`;

const WsCardMeta = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
`;

const RoleBadge = styled.span<{ $isOwner: boolean }>`
    display: inline-flex;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    background: ${({ $isOwner }) =>
        $isOwner ? 'hsla(var(--warning) / 0.12)' : 'rgba(59, 130, 246, 0.12)'};
    color: ${({ $isOwner }) =>
        $isOwner ? 'hsl(var(--warning))' : '#60a5fa'};
`;

const ActiveDot = styled.span`
    font-size: 12px;
    color: hsl(var(--primary));
`;

const WsCardRight = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ActionBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms;

    &:hover {
        background: var(--overlay-subtle);
    }
`;

const LeaveBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: hsla(var(--destructive) / 0.08);
    border: 1px solid hsla(var(--destructive) / 0.2);
    border-radius: 6px;
    color: hsl(var(--destructive));
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms;

    &:hover {
        background: hsla(var(--destructive) / 0.15);
    }
`;

// Dialog styles
const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--overlay-backdrop);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Dialog = styled.div`
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 420px;
    margin: 16px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
`;

const DialogTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 8px 0;
`;

const DialogText = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0 0 20px 0;
    line-height: 1.5;
`;

const DialogActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

const CancelBtn = styled.button`
    padding: 8px 14px;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 7px;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 150ms;

    &:hover { background: var(--overlay-subtle); }
`;

const ConfirmLeaveBtn = styled.button`
    padding: 8px 14px;
    background: hsl(var(--destructive));
    border: none;
    border-radius: 7px;
    color: hsl(var(--destructive-foreground));
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: filter 150ms;

    &:hover { filter: brightness(0.9); }
`;
