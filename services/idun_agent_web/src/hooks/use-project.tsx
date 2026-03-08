import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { getJson, postJson, patchJson, deleteRequest } from '../utils/api';

export type Project = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    is_default: boolean;
    workspace_id: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};

export type ProjectDeleteInfo = {
    project_id: string;
    project_name: string;
    resource_counts: Record<string, number>;
    total_resources: number;
};

interface ProjectContextValue {
    selectedProjectId: string | null;
    setSelectedProjectId: (id: string | null) => void;
    projects: Project[];
    refreshProjects: () => Promise<void>;
    createProject: (name: string) => Promise<Project>;
    updateProject: (id: string, name: string) => Promise<Project>;
    deleteProject: (id: string) => Promise<void>;
    getDeleteInfo: (id: string) => Promise<ProjectDeleteInfo>;
    confirmDelete: (id: string, action: 'move' | 'delete_resources', targetProjectId?: string) => Promise<void>;
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
        await deleteRequest(`/api/v1/projects/${id}?action=delete_resources`);
        if (selectedProjectId === id) {
            setSelectedProjectId(null);
        }
        await refreshProjects();
    }, [refreshProjects, selectedProjectId, setSelectedProjectId]);

    const getDeleteInfo = useCallback(async (id: string): Promise<ProjectDeleteInfo> => {
        return deleteRequest<ProjectDeleteInfo>(`/api/v1/projects/${id}`);
    }, []);

    const confirmDelete = useCallback(async (id: string, action: 'move' | 'delete_resources', targetProjectId?: string): Promise<void> => {
        let url = `/api/v1/projects/${id}?action=${action}`;
        if (action === 'move' && targetProjectId) {
            url += `&target_project_id=${targetProjectId}`;
        }
        await deleteRequest(url);
        if (selectedProjectId === id) {
            setSelectedProjectId(null);
        }
        await refreshProjects();
    }, [refreshProjects, selectedProjectId, setSelectedProjectId]);

    // Auto-select default project when projects load and nothing is selected
    useEffect(() => {
        if (projects.length === 0) return;
        const currentValid = selectedProjectId && projects.some(p => p.id === selectedProjectId);
        if (!currentValid) {
            const defaultProject = projects.find(p => p.is_default) ?? projects[0];
            if (defaultProject) {
                setSelectedProjectId(defaultProject.id);
            }
        }
    }, [projects, selectedProjectId, setSelectedProjectId]);

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
                getDeleteInfo,
                confirmDelete,
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
