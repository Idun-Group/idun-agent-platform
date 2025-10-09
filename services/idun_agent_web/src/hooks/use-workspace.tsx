import { createContext, useContext, useState, type ReactNode } from 'react';
import { getJson } from '../utils/api';

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

    const getAllWorkspace = async () => {
        try {
            return await getJson('/api/v1/workspaces');
        } catch (error) {
            console.error('Error fetching workspaces:', error);
            return [] as unknown[];
        }
    };

    return {
        selectedWorkspaceId: context.workspaceId,
        setSelectedWorkspaceId: context.setWorkspaceId,
        getAllWorkspace,
    };
};

export default useWorkspace;
