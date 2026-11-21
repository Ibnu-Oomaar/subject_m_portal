import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '@/components/common';
import { ErrorState } from '@/components/common';
import type { Role } from '@/lib/types';
import { useAuth } from './AuthProvider';

/** Route guard. The server enforces access on every request; this only decides which screen to show. */
export function RequireRole({ role }: { role: Role }) {
  const { session, loading, error, retry } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (error) return <div className="mx-auto mt-24 max-w-md px-4"><ErrorState error={error} onRetry={retry} title="Could not check your session" /></div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.role !== role) return <Navigate to={session.role === 'teacher' ? '/' : '/student'} replace />;
  return <Outlet />;
}
