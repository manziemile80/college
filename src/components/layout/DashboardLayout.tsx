import { ReactNode, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { AppTopBar } from './AppTopBar';
import { Footer } from './Footer';
import { Loader2 } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, role } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleCollapsed = () => setSidebarCollapsed((v) => !v);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-[26px] font-bold text-slate-900">No Role Assigned</h2>
          <p className="mt-2 text-muted-foreground">
            Please contact an administrator to assign you a role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={sidebarCollapsed} />
      <div className={cn('transition-all duration-300 ease-in-out', sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-[272px]')}>
        <AppTopBar collapsed={sidebarCollapsed} onToggleCollapsed={toggleCollapsed} />
        <main className="flex min-h-[calc(100vh-4rem)] flex-col">
          <div className="page-space flex-1 space-y-6">{children}</div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
