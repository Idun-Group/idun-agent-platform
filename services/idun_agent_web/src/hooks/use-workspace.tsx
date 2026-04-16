/* eslint-disable react-refresh/only-export-components */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

import { useAuth } from './use-auth';
import type { WorkspaceSummary } from '../utils/auth';
import { getStoredWorkspaceId, setStoredWorkspaceId } from '../utils/api';

type WorkspaceContextValue = {
    selectedWorkspaceId: string | null;
    currentWorkspace: WorkspaceSummary | null;
    workspaces: WorkspaceSummary[];
    isCurrentWorkspaceOwner: boolean;
    setSelectedWorkspaceId: (id: string | null) => void;
    getAllWorkspace: (params?: { limit?: number; offset?: number }) => Promise<WorkspaceSummary[]>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
    const { session } = useAuth();
    const [workspaceId, setWorkspaceId] = useState<string | null>(() => getStoredWorkspaceId());

    const workspaces = useMemo(
        () => session?.principal?.workspaces ?? [],
        [session?.principal?.workspaces],
    );

    useEffect(() => {
        const workspaceIds = workspaces.map((workspace) => workspace.id);
        if (!workspaceIds.length) {
            setWorkspaceId(null);
            setStoredWorkspaceId(null);
            return;
        }

        const storedId = getStoredWorkspaceId();
        const defaultId = session?.principal?.default_workspace_id ?? null;
        const nextWorkspaceId =
            (storedId && workspaceIds.includes(storedId) && storedId) ||
            (defaultId && workspaceIds.includes(defaultId) && defaultId) ||
            workspaceIds[0] ||
            null;

        setWorkspaceId(nextWorkspaceId);
        setStoredWorkspaceId(nextWorkspaceId);
    }, [workspaces, session?.principal?.default_workspace_id]);

    const setSelectedWorkspaceId = useCallback((id: string | null) => {
        setWorkspaceId(id);
        setStoredWorkspaceId(id);
    }, []);

    const currentWorkspace = useMemo(
        () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
        [workspaceId, workspaces],
    );

    const getAllWorkspace = useCallback(async () => {
        return workspaces;
    }, [workspaces]);

    const value = useMemo(
        () => ({
            selectedWorkspaceId: workspaceId,
            currentWorkspace,
            workspaces,
            isCurrentWorkspaceOwner: currentWorkspace?.is_owner ?? false,
            setSelectedWorkspaceId,
            getAllWorkspace,
        }),
        [workspaceId, currentWorkspace, workspaces, setSelectedWorkspaceId, getAllWorkspace],
    );

    return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

const useWorkspace = () => {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error('useWorkspace must be used within a WorkspaceProvider');
    }
    return context;
};

export default useWorkspace;
