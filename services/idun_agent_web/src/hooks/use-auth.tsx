import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSession, loginBasic, logoutBasic, signupBasic } from '../utils/auth';
import { addUnauthorizedHandler, removeUnauthorizedHandler, API_BASE_URL } from '../utils/api';
import type { Session } from '../utils/auth';

interface AuthContextValue {
    session: Session | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<boolean>;
    loginOIDC: () => void;
    logout: () => Promise<void>;
    signup: (params: { email: string; password: string; name?: string | null }) => Promise<void>;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const s = await getSession();
            setSession(s);
            // Auto-select a tenant/workspace if available and none selected yet
            try {
                if (typeof window !== 'undefined') {
                    const hasActive = localStorage.getItem('activeTenantId');
                    const firstWorkspace = s?.principal?.workspace_ids?.[0];
                    if (!hasActive && firstWorkspace) {
                        localStorage.setItem('activeTenantId', firstWorkspace);
                    }
                }
            } catch {}
        } finally {
            setIsLoading(false);
        }
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        await loginBasic({ email, password });
        const s = await getSession();
        setSession(s);
        // Auto-select a tenant/workspace after login
        try {
            if (typeof window !== 'undefined') {
                const hasActive = localStorage.getItem('activeTenantId');
                const firstWorkspace = s?.principal?.workspace_ids?.[0];
                if (!hasActive && firstWorkspace) {
                    localStorage.setItem('activeTenantId', firstWorkspace);
                }
            }
        } catch {}
        return !!s;
    }, []);

    const logout = useCallback(async () => {
        await logoutBasic();
        setSession(null);
    }, []);

    const signup = useCallback(async (params: { email: string; password: string; name?: string | null }) => {
        await signupBasic(params);
    }, []);

    useEffect(() => {
        // Attempt to hydrate session on mount
        let isRefreshingFrom401 = false;
        const onUnauthorized = () => {
            // When a 401 occurs, opportunistically re-validate the session once.
            if (isRefreshingFrom401) return;
            isRefreshingFrom401 = true;
            void (async () => {
                try {
                    const s = await getSession();
                    setSession(s);
                } finally {
                    isRefreshingFrom401 = false;
                }
            })();
        };
        addUnauthorizedHandler(onUnauthorized);
        void refresh();
        return () => removeUnauthorizedHandler(onUnauthorized);
    }, [refresh]);

    const loginOIDC = useCallback(() => {
        if (typeof window !== 'undefined') {
            window.location.href = `${API_BASE_URL}/api/v1/auth/login`;
        }
    }, []);

    const value = useMemo(
        () => ({ session, isLoading, login, loginOIDC, logout, signup, refresh }),
        [session, isLoading, login, loginOIDC, logout, signup, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
}
