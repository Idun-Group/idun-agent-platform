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

    return <Outlet />;
}
