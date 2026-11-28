import { Navigate } from 'react-router-dom';
import { Loader2 } from '@/lib/icons';
import { useAuth } from '@/contexts/AuthContext';
import { hasAnyPermission, type Permission } from '@/lib/permissions';
import { Forbidden } from '@/pages/Forbidden';

interface Props {
  children: React.ReactNode;
  /** Any one of these permissions grants access. */
  permission: Permission | Permission[];
}

/** Route-level RBAC guard. Navigation hiding is never used as the only gate. */
export function RequirePermission({ children, permission }: Props) {
  const { user, loading, permissions } = useAuth();
  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center min-vh-100">
        <span className="spinner-border spinner-border-lg text-success" role="status" />
        <Loader2 className="visually-hidden" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  const needed = Array.isArray(permission) ? permission : [permission];
  return hasAnyPermission(permissions, needed) ? <>{children}</> : <Forbidden />;
}
