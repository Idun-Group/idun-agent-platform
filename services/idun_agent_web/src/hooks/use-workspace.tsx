import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getJson } from '../utils/api';

type Workspace = {
    id: string;
    name: string;
    icon: string;
    description: string;
};

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

    const getAllWorkspace = useCallback(
        async (params?: { limit?: number; offset?: number }): Promise<Workspace[]> => {
            try {
                const query = new URLSearchParams();
                if (params?.limit != null) query.set('limit', String(params.limit));
                if (params?.offset != null) query.set('offset', String(params.offset));
                const qs = query.toString();
                const path = `/api/v1/workspaces/${qs ? `?${qs}` : ''}`;
                return await getJson<Workspace[]>(path);
            } catch (error) {
                console.error('Error fetching workspaces:', error);
                return [] as Workspace[];
            }
        },
        []
    );

    return {
        selectedWorkspaceId: context.workspaceId,
        setSelectedWorkspaceId: context.setWorkspaceId,
        getAllWorkspace,
    };
};

export default useWorkspace;
