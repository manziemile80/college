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
  const toggleCollapsed = () => setSidebarCollapsed((v) => !v);

  if (loading) {
    return (
      <div className="bd-shell min-vh-100 d-flex align-items-center justify-content-center">
        <div className="d-flex flex-column align-items-center gap-3">
          <span className="spinner-border text-primary" role="status" aria-label="Loading" />
          <p className="text-muted bd-fs-md">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!role) {
    return (
      <div className="bd-shell min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <h2 className="bd-page-title">No Role Assigned</h2>
          <p className="mt-2 text-muted">
            Please contact an administrator to assign you a role.
          </p>
        </div>
      </div>
    );
  }

  const initials = profile?.full_name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className={cn('bd-shell', sidebarCollapsed && 'sidebar-collapsed')}>
      {/* ── Top navigation bar ── */}
      <header className="bd-topbar" aria-label="Main navigation">
        <button
          type="button"
          className="bd-icon-btn d-lg-none"
          data-bs-toggle="offcanvas"
          data-bs-target="#bd-sidebar-oc"
          aria-label="Open navigation"
        >
          <Menu className="bd-nav-icon" />
        </button>

        <Link to="/dashboard" className="bd-brand" aria-label="College De Rebero home">
          <img src={schoolLogo} alt="College De Rebero" width={28} height={28} />
          <span className="d-none d-sm-inline">College De Rebero</span>
        </Link>

        <span className="bd-page-title d-none d-md-inline">Student Behavior Management System</span>

        <input
          type="search"
          className="form-control bd-search-input rounded-pill d-none d-md-block"
          placeholder="Search anything..."
          aria-label="Search"
          data-bs-toggle="modal"
          data-bs-target="#bd-search-modal"
        />

        <div className="bd-notifications position-relative">
          <button type="button" className="bd-icon-btn" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Notifications">
            <Bell className="bd-nav-icon" />
          </button>
          <span className="bd-badge-dot" />
        </div>

        <button type="button" className="bd-icon-btn" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Toggle theme">
          {theme === 'dark' ? <Moon className="bd-nav-icon" /> : <Sun className="bd-nav-icon" />}
        </button>

        <button
          type="button"
          className="bd-icon-btn"
          data-bs-toggle="dropdown"
          data-bs-display="static"
          aria-expanded="false"
          aria-haspopup="true"
          aria-label="User menu"
        >
          <span className="bd-avatar">{initials}</span>
        </button>

        <ul className="dropdown-menu dropdown-menu-end shadow-lg">
          <li className="px-3 py-2">
            <span className="d-block fw-semibold text-main bd-fs-md">{profile?.full_name || 'User'}</span>
            <small className="text-muted">{role}</small>
          </li>
          <li><hr className="dropdown-divider m-0" /></li>
          <li>
            <Link to="/settings" className="dropdown-item d-flex align-items-center gap-2">
              <UserCog /> Profile &amp; account
            </Link>
          </li>
          <li>
            <Link to="/settings" className="dropdown-item d-flex align-items-center gap-2">
              <UserCog /> Settings
            </Link>
          </li>
          <li><hr className="dropdown-divider m-0" /></li>
          <li>
            <button type="button" className="dropdown-item text-danger d-flex align-items-center gap-2" onClick={signOut}>
              <LogOut /> Sign out
            </button>
          </li>
        </ul>
      </header>

      {/* ── Fixed sidebar (desktop) ── */}
      <aside className="bd-sidebar d-none d-lg-block" aria-label="Primary navigation">
        <SidebarNav collapsed={sidebarCollapsed} onCollapseToggle={toggleCollapsed} />
      </aside>

      {/* ── Mobile offcanvas sidebar ── */}
      <div
        className="offcanvas offcanvas-start bd-sidebar-oc"
        id="bd-sidebar-oc"
        tabIndex={-1}
        aria-labelledby="bd-sidebar-oc-title"
      >
        <div className="offcanvas-header d-flex align-items-center justify-content-between p-3">
          <h5 className="offcanvas-title mb-0 fw-bold" id="bd-sidebar-oc-title">College De Rebero</h5>
          <button type="button" className="btn bd-btn-ghost p-2" data-bs-dismiss="offcanvas" aria-label="Close">
            <X className="bd-nav-icon" />
          </button>
        </div>
        <div className="offcanvas-body d-flex flex-column p-0">
          <SidebarNav />
        </div>
      </div>

      {/* ── Global search modal ── */}
      <div id="bd-search-modal" className="modal fade" tabIndex={-1} aria-hidden="true">
        <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header border-light">
              <h5 className="modal-title">Modules</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
            </div>
            <div className="modal-body">
              <input
                type="search"
                className="form-control bd-search-input rounded-pill mb-3"
                placeholder="Search modules..."
                aria-label="Search modules"
                autoFocus
              />
              <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
                {navItems
                  .filter((item) => role && item.roles.includes(role))
                  .map((item) => (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        className="bd-nav-link d-flex align-items-center gap-2 p-2 text-main"
                        data-bs-dismiss="modal"
                      >
                        <item.icon className="bd-nav-icon" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="bd-main" aria-label="Main content">
        <div>{children}</div>
        <Footer />
      </main>
    </div>
  );
}
