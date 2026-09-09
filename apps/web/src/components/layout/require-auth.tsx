import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export function RedirectIfAuthenticated() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function RootRedirect() {
  const { isAuthenticated } = useAuth();
  const lastChurchId = useUiStore((state) => state.lastChurchId);
  if (!isAuthenticated) return <Navigate to="/welcome" replace />;
  return <Navigate to={lastChurchId ? `/c/${lastChurchId}` : '/churches'} replace />;
}
