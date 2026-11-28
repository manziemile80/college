import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/types/database';
import { Loader2 } from '@/lib/icons';
import {
  AdminDashboard,
  TeacherDashboard,
  StudentDashboard,
  ParentDashboard,
  StockManagerDashboard,
  DosDashboard,
  DodDashboard,
  ViewerDashboard,
  roleCopyFor,
} from '@/components/dashboard/RoleDashboards';

/** Most privileged first — a multi-role user sees their highest-access view. */
const ROLE_PRIORITY: AppRole[] = [
  'admin', 'dos', 'dod', 'stock_manager', 'teacher', 'parent', 'student', 'viewer',
];

export default function Dashboard() {
  const { roles, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen d-flex flex-column align-items-center justify-content-center gap-3 bg-slate-50">
        <Loader2 className="animate-spin text-success" size={32} />
        <p className="text-muted bd-fs-sm mb-0">Loading your dashboard…</p>
      </div>
    );
  }

  const primaryRole = ROLE_PRIORITY.find((candidate) => roles.includes(candidate)) ?? role ?? null;

  if (!primaryRole) {
    return (
      <div className="min-h-screen d-flex align-items-center justify-content-center bg-slate-50">
        <div className="text-center">
          <h2 className="fw-bold text-main mb-2">No Role Assigned</h2>
          <p className="text-muted mb-0">
            Please contact an administrator to assign you a role ({roleCopyFor(null)} access unavailable).
          </p>
        </div>
      </div>
    );
  }

  switch (primaryRole) {
    case 'admin': return <AdminDashboard />;
    case 'dos': return <DosDashboard />;
    case 'dod': return <DodDashboard />;
    case 'stock_manager': return <StockManagerDashboard />;
    case 'teacher': return <TeacherDashboard />;
    case 'parent': return <ParentDashboard />;
    case 'student': return <StudentDashboard />;
    case 'viewer': return <ViewerDashboard />;
    default: return <ViewerDashboard />;
  }
}
