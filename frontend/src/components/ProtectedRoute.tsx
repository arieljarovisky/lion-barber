import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type ProtectedRouteProps = {
  children: ReactNode;
  adminOnly?: boolean;
  /** Admin o empleado (staff) — panel /dashboard */
  dashboardAccess?: boolean;
};

export default function ProtectedRoute({
  children,
  adminOnly = false,
  dashboardAccess = false,
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500 font-medium">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (
    dashboardAccess &&
    profile?.role !== 'admin' &&
    profile?.role !== 'staff'
  ) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
