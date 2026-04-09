import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/use-auth';

export default function RequireAuth() {
    const { session, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) return null;

    if (!session) {
        sessionStorage.setItem('returnUrl', location.pathname + location.search);
        return <Navigate to="/login" replace />;
    }

    const hasWorkspaces = (session.principal?.workspace_ids?.length ?? 0) > 0;
    if (!hasWorkspaces && location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />;
    }

    return <Outlet />;
}
