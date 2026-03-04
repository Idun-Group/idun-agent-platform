import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { getJson, postJson, patchJson, deleteRequest } from '../utils/api';

export type Project = {
    id: string;
    name: string;
    slug: string;
    is_default: boolean;
    workspace_id: string;
    created_at: string;
    updated_at: string;
};

interface ProjectContextValue {
    selectedProjectId: string | null;
    setSelectedProjectId: (id: string | null) => void;
    projects: Project[];
    refreshProjects: () => Promise<void>;
    createProject: (name: string) => Promise<Project>;
    updateProject: (id: string, name: string) => Promise<Project>;
    deleteProject: (id: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

const STORAGE_KEY = 'activeProjectId';

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem(STORAGE_KEY);
    });
    const [projects, setProjects] = useState<Project[]>([]);

    const setSelectedProjectId = useCallback((id: string | null) => {
        setSelectedProjectIdState(id);
        if (id) {
            localStorage.setItem(STORAGE_KEY, id);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    const refreshProjects = useCallback(async () => {
        try {
            const data = await getJson<Project[]>('/api/v1/projects/');
            setProjects(data);
        } catch (error) {
            console.error('Error fetching projects:', error);
        }
    }, []);

    const createProject = useCallback(async (name: string): Promise<Project> => {
        const project = await postJson<Project>('/api/v1/projects/', { name });
        await refreshProjects();
        return project;
    }, [refreshProjects]);

    const updateProject = useCallback(async (id: string, name: string): Promise<Project> => {
        const project = await patchJson<Project>(`/api/v1/projects/${id}`, { name });
        await refreshProjects();
        return project;
    }, [refreshProjects]);

    const deleteProject = useCallback(async (id: string): Promise<void> => {
        await deleteRequest(`/api/v1/projects/${id}`);
        // If the deleted project was selected, clear selection
        if (selectedProjectId === id) {
            setSelectedProjectId(null);
        }
        await refreshProjects();
    }, [refreshProjects, selectedProjectId, setSelectedProjectId]);

    // Clear project selection when workspace changes
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'activeTenantId') {
                setSelectedProjectId(null);
                setProjects([]);
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [setSelectedProjectId]);

    return (
        <ProjectContext.Provider
            value={{
                selectedProjectId,
                setSelectedProjectId,
                projects,
                refreshProjects,
                createProject,
                updateProject,
                deleteProject,
            }}
        >
            {children}
        </ProjectContext.Provider>
    );
};

export function useProject(): ProjectContextValue {
    const ctx = useContext(ProjectContext);
    if (!ctx) throw new Error('useProject must be used within a ProjectProvider');
    return ctx;
}

export default useProject;
