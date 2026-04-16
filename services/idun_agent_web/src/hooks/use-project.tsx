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

import { getStoredProjectId, setStoredProjectId } from '../utils/api';
import { listProjects } from '../services/projects';
import useWorkspace from './use-workspace';

export type ProjectRole = 'admin' | 'contributor' | 'reader';

export type ProjectSummary = {
    id: string;
    workspace_id: string;
    name: string;
    description?: string | null;
    is_default: boolean;
    current_user_role?: ProjectRole | null;
};

type ProjectContextValue = {
    selectedProjectId: string | null;
    currentProject: ProjectSummary | null;
    projects: ProjectSummary[];
    currentRole: ProjectRole | null;
    canWrite: boolean;
    canAdmin: boolean;
    isLoadingProjects: boolean;
    setSelectedProjectId: (projectId: string | null) => void;
    refreshProjects: () => Promise<ProjectSummary[]>;
};

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const { selectedWorkspaceId, currentWorkspace } = useWorkspace();
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);

    const refreshProjects = useCallback(async (): Promise<ProjectSummary[]> => {
        if (!selectedWorkspaceId) {
            setProjects([]);
            setSelectedProjectIdState(null);
            return [];
        }

        setIsLoadingProjects(true);
        try {
            const nextProjects = (await listProjects()) as ProjectSummary[];
            setProjects(nextProjects);

            const availableProjectIds = nextProjects.map((project) => project.id);
            const storedProjectId = getStoredProjectId(selectedWorkspaceId);
            const defaultProjectId = currentWorkspace?.default_project_id ?? null;
            const nextProjectId =
                (storedProjectId && availableProjectIds.includes(storedProjectId) && storedProjectId) ||
                (defaultProjectId && availableProjectIds.includes(defaultProjectId) && defaultProjectId) ||
                nextProjects.find((project) => project.is_default)?.id ||
                nextProjects[0]?.id ||
                null;

            setSelectedProjectIdState(nextProjectId);
            setStoredProjectId(selectedWorkspaceId, nextProjectId);
            return nextProjects;
        } finally {
            setIsLoadingProjects(false);
        }
    }, [selectedWorkspaceId, currentWorkspace?.default_project_id]);

    useEffect(() => {
        void refreshProjects();
    }, [refreshProjects]);

    const setSelectedProjectId = useCallback(
        (projectId: string | null) => {
            setSelectedProjectIdState(projectId);
            if (selectedWorkspaceId) {
                setStoredProjectId(selectedWorkspaceId, projectId);
            }
        },
        [selectedWorkspaceId],
    );

    const currentProject = useMemo(
        () => projects.find((project) => project.id === selectedProjectId) ?? null,
        [projects, selectedProjectId],
    );

    const currentRole = currentProject?.current_user_role ?? null;
    const canWrite = currentRole === 'admin' || currentRole === 'contributor';
    const canAdmin = currentRole === 'admin';

    const value = useMemo(
        () => ({
            selectedProjectId,
            currentProject,
            projects,
            currentRole,
            canWrite,
            canAdmin,
            isLoadingProjects,
            setSelectedProjectId,
            refreshProjects,
        }),
        [
            selectedProjectId,
            currentProject,
            projects,
            currentRole,
            canWrite,
            canAdmin,
            isLoadingProjects,
            setSelectedProjectId,
            refreshProjects,
        ],
    );

    return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export function useProject(): ProjectContextValue {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
}
