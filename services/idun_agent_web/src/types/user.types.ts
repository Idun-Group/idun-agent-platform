export type User = {
    id: string;
    email: string;
    name?: string | null;
    roles?: string[];
    workspace_ids?: string[];
};
