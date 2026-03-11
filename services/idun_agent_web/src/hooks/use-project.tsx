import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { getJson, postJson, patchJson, deleteRequest } from '../utils/api';
import { useAuth } from './use-auth';

export type Project = {
    id: string;
    name: string;
    slug: string;
    is_default: boolean;
    workspace_id: string;
    created_at: string;
    updated_at: string;
};

export type ProjectRole = 'admin' | 'contributor' | 'reader';

type ProjectMemberRead = {
    user_id: string;
    role: ProjectRole;
};

type ProjectMemberListResponse = {
    members: ProjectMemberRead[];
    total: number;
};

interface ProjectContextValue {
    selectedProjectId: string | null;
    setSelectedProjectId: (id: string | null) => void;
    projects: Project[];
    projectRoles: Record<string, ProjectRole>;
    isWorkspaceOwner: boolean;
    canAccessSettings: boolean;
    refreshProjects: () => Promise<void>;
    createProject: (name: string) => Promise<Project>;
    updateProject: (id: string, name: string) => Promise<Project>;
    deleteProject: (id: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

const STORAGE_KEY = 'activeProjectId';

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const { session } = useAuth();
    const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem(STORAGE_KEY);
    });
    const [projects, setProjects] = useState<Project[]>([]);
    const [projectRoles, setProjectRoles] = useState<Record<string, ProjectRole>>({});
    const [isWorkspaceOwner, setIsWorkspaceOwner] = useState(false);

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

            // Auto-select: if no project selected or selected not in list, pick default
            const currentId = localStorage.getItem(STORAGE_KEY);
            const validSelection = currentId && data.some((p) => p.id === currentId);
            if (!validSelection && data.length > 0) {
                const defaultProject = data.find((p) => p.is_default) ?? data[0];
                setSelectedProjectId(defaultProject.id);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        }
    }, [setSelectedProjectId]);

    const refreshRoles = useCallback(async (projectList: Project[], userId: string) => {
        try {
            // Fetch members for each project — the endpoint includes workspace
            // owners as implicit admin entries with is_workspace_owner=true
            const roles: Record<string, ProjectRole> = {};
            let detectedOwner = false;

            await Promise.all(
                projectList.map(async (p) => {
                    try {
                        const res = await getJson<{
                            members: {
                                user_id: string;
                                role: ProjectRole;
                                is_workspace_owner?: boolean;
                            }[];
                            total: number;
                        }>(`/api/v1/projects/${p.id}/members`);
                        const me = res.members.find((m) => m.user_id === userId);
                        if (me) {
                            roles[p.id] = me.role;
                            if (me.is_workspace_owner) detectedOwner = true;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch members for project ${p.id}:`, err);
                    }
                }),
            );

            setIsWorkspaceOwner(detectedOwner);
            setProjectRoles(roles);
        } catch (err) {
            console.error('Failed to refresh roles:', err);
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

    // Refresh roles whenever projects list or session changes
    useEffect(() => {
        const userId = session?.principal?.user_id;
        if (userId && projects.length > 0) {
            refreshRoles(projects, userId);
        }
    }, [projects, session, refreshRoles]);

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

    const canAccessSettings =
        isWorkspaceOwner || Object.values(projectRoles).some((r) => r === 'admin');

    return (
        <ProjectContext.Provider
            value={{
                selectedProjectId,
                setSelectedProjectId,
                projects,
                projectRoles,
                isWorkspaceOwner,
                canAccessSettings,
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
