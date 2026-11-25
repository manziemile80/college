import { ReactNode, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import schoolLogo from '@/assets/college-rebero-logo.png';
import { Loader2, Menu, Bell, Sun, Moon, UserCog, LogOut, X } from '@/lib/icons';
import { navItems } from './navItems';
import { SidebarNav } from './SidebarNav';
import { Footer } from './Footer';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, role, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleCollapsed = () => setSidebarCollapsed((v) => !v);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">No Role Assigned</h2>
          <p className="mt-2 text-slate-500">
            Please contact an administrator to assign you a role.
          </p>
        </div>
      </div>
    );
  }

  const initials = profile?.full_name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className={cn('min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100', sidebarCollapsed && 'sidebar-collapsed')}>
      {/* Top navigation bar */}
      <header className="fixed top-0 left-0 right-0 z-30 h-16 flex items-center gap-3 px-4 bg-white border-b border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
        <button
          type="button"
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full text-slate-500 hover:bg-slate-100"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 shrink-0" aria-label="College De Rebero home">
          <img src={schoolLogo} alt="College De Rebero" width={28} height={28} />
          <span className="hidden sm:inline">College De Rebero</span>
        </Link>

        <span className="hidden md:inline flex-1 min-w-0 text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          Student Behavior Management System
        </span>

        <div className="hidden md:flex flex-1 min-w-[160px] max-w-[460px]">
          <input
            type="search"
            className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            placeholder="Search anything..."
            aria-label="Search"
          />
        </div>

        <div className="relative">
          <button type="button" className="inline-flex items-center justify-center w-10 h-10 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" title="Notifications">
            <Bell className="w-5 h-5" />
          </button>
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-600" />
        </div>

        <button type="button" className="inline-flex items-center justify-center w-10 h-10 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>

        <div className="relative group">
          <button type="button" className="bd-user-avatar inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-600 text-white font-semibold text-sm" aria-label="User menu">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile?.full_name || 'User'} className="bd-avatar-img w-full h-full object-cover" />
            ) : (
              initials
            )}
          </button>
          <div className="bd-user-menu absolute right-0 top-full mt-2 hidden group-hover:block w-56 bg-white shadow-lg border border-slate-200 py-2 dark:bg-slate-800 dark:border-slate-700 z-40">
            <div className="px-3 py-2">
              <span className="block font-semibold text-sm text-slate-900 dark:text-slate-100">{profile?.full_name || 'User'}</span>
              <small className="text-slate-500">{role}</small>
            </div>
            <hr className="my-1 border-slate-200 dark:border-slate-700" />
            <Link to="/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700">
              <UserCog className="w-4 h-4" /> Profile &amp; account
            </Link>
            <Link to="/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700">
              <UserCog className="w-4 h-4" /> Settings
            </Link>
            <hr className="my-1 border-slate-200 dark:border-slate-700" />
            <button type="button" className="bd-signout-btn w-full justify-start text-red-600" onClick={signOut}>
              <LogOut className="w-4 h-4 shrink-0" /> Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className={cn('hidden lg:flex fixed top-16 left-0 bottom-0 flex-col bg-white border-r border-slate-200 dark:bg-slate-800 dark:border-slate-700 transition-all', sidebarCollapsed ? 'w-14' : 'w-64')}>
        <SidebarNav collapsed={sidebarCollapsed} onCollapseToggle={toggleCollapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white border-r border-slate-200 dark:bg-slate-800 dark:border-slate-700 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h5 className="font-bold text-slate-900 dark:text-slate-100">College De Rebero</h5>
              <button type="button" className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-500" onClick={() => setMobileOpen(false)} aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav onLinkSelect={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className={cn('pt-16 min-h-screen', sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-64')}>
        <div className="p-4 md:p-6">
          {children}
          <Footer />
        </div>
      </main>
    </div>
  );
}