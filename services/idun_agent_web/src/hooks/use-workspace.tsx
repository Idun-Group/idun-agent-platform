import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getJson } from '../utils/api';

type Workspace = {
    id: string;
    name: string;
    icon: string;
    description: string;
};

const WORKSPACES_ENABLED = (import.meta.env.VITE_FEATURE_WORKSPACES as string) === 'true';

const WorkspaceContext = createContext<
    | {
          workspaceId: string | null;
          setWorkspaceId: (id: string | null) => void;
      }
    | undefined
>(undefined);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);

    return (
        <WorkspaceContext.Provider value={{ workspaceId, setWorkspaceId }}>
            {children}
        </WorkspaceContext.Provider>
    );
};

const useWorkspace = () => {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error('useWorkspace must be used within a WorkspaceProvider');
    }

    const getAllWorkspace = useCallback(async (): Promise<Workspace[]> => {
        if (!WORKSPACES_ENABLED) return [] as Workspace[];
        try {
            return await getJson<Workspace[]>('/api/v1/workspaces');
        } catch (error) {
            console.error('Error fetching workspaces:', error);
            return [] as Workspace[];
        }
    }, []);

    return {
        selectedWorkspaceId: context.workspaceId,
        setSelectedWorkspaceId: context.setWorkspaceId,
        getAllWorkspace,
    };
};

export default useWorkspace;
