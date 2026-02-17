import { getJson, postJson } from './api';
import type { User } from '../types/user.types';

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

export async function logoutSession(): Promise<void> {
    await postJson('/api/v1/auth/logout', {});
}

export async function signupBasic(params: { email: string; password: string; name?: string | null; roles?: string[]; workspaces?: string[] }): Promise<{ id: string; email: string; name?: string | null; roles?: string[]; workspace_ids?: string[] }>{
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

export async function assignRole(params: { user_id: string; role: 'admin' | 'user' }): Promise<{ ok: true }>{
    return postJson('/api/v1/auth/roles/assign', params);
}

export async function getRoles(): Promise<string[]> {
    try {
        const roles = await getJson<string[]>('/api/v1/auth/roles');
        if (Array.isArray(roles) && roles.length > 0) return roles;
        return ['admin', 'user'];
    } catch {
        return ['admin', 'user'];
    }
}

export async function listUsers(): Promise<User[]> {
    try {
        return await getJson('/api/v1/users');
    } catch {
        return [];
    }
}
