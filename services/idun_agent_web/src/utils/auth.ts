import { getJson, postJson } from './api';

export interface SessionPrincipal {
    user_id?: string;
    email?: string;
    roles?: string[];
    workspace_ids?: string[];
}

export interface Session {
    provider?: string;
    principal?: SessionPrincipal;
    expires_at?: number;
}

export async function loginBasic(params: { email: string; password: string }): Promise<void> {
    await postJson('/api/v1/auth/basic/login', params);
}

export async function logoutBasic(): Promise<void> {
    await postJson('/api/v1/auth/basic/logout', {});
}

export async function signupBasic(params: { email: string; password: string; name?: string | null }): Promise<{ id: string; email: string; name?: string | null }>{
    return postJson('/api/v1/auth/basic/signup', params);
}

export async function getSession(): Promise<Session | null> {
    try {
        const res = await getJson<{ session: Session }>('/api/v1/auth/me');
        return res.session ?? null;
    } catch {
        return null;
    }
}


