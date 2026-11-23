import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import schoolLogo from '@/assets/college-rebero-logo.png';
import { UserCog, LogOut, Sun, Moon, ChevronLeft, ChevronRight } from '@/lib/icons';
import { navItems, roleBadges, NavItem } from './navItems';

interface SidebarNavProps {
  collapsed?: boolean;
  /** Called when a navigation link is selected. */
  onLinkSelect?: () => void;
  /** Called by the collapse/expand button. */
  onCollapseToggle?: () => void;
}

export function SidebarNav({ collapsed = false, onLinkSelect, onCollapseToggle }: SidebarNavProps) {
  const { role, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const visible = navItems.filter((item) => role && item.roles.includes(role));
  const badge = role ? roleBadges[role] : null;

  /* ── Collapsed (icon-only) sidebar ── */
  if (collapsed) {
    return (
      <>
        <div className="bd-sidebar-header d-flex justify-content-center align-items-center px-2">
          <img src={schoolLogo} alt="College De Rebero" width={28} height={28} />
        </div>
        <nav className="d-flex flex-grow-1 flex-column align-items-center gap-1 overflow-y-auto px-2 py-3">
          {visible.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => onLinkSelect?.()}
                className={cn('bd-nav-link-icon-only position-relative text-main', isActive && 'active')}
                aria-label={item.label}
                title={item.label}
                data-bs-dismiss="offcanvas"
              >
                <item.icon className="bd-nav-icon" />
                {isActive && <span className="bd-active-dot" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>
        <div className="d-flex flex-column align-items-center gap-1 border-top border-light pt-2 px-2 py-3">
          <button type="button" className="bd-nav-link-icon-only text-main" onClick={() => onCollapseToggle?.()} aria-label="Expand sidebar" title="Expand sidebar">
            <ChevronRight className="bd-nav-icon" />
          </button>
          <button
            type="button"
            className="bd-nav-link-icon-only text-main"
            onClick={() => { signOut(); onLinkSelect?.(); }}
            aria-label="Sign out"
          >
            <LogOut className="bd-nav-icon" />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Institution header */}
      <div className="bd-sidebar-header">
        <img src={schoolLogo} alt="College De Rebero" width={28} height={28} />
        <div className="min-w-0">
          <p className="fw-semibold text-main mb-0">College De Rebero</p>
          <p className="text-muted bd-fs-sm mt-1 mb-0">School &amp; E-Learning</p>
        </div>
      </div>

      {/* User profile section */}
      <div className="bd-sidebar-user px-3 py-3" onClick={() => onLinkSelect?.()}>
        <span className="bd-avatar">{profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}</span>
        <div className="min-w-0 flex-grow-1 d-flex flex-column gap-0.5">
          <p className="fw-semibold text-main mb-0 text-truncate">{profile?.full_name || 'User'}</p>
          {badge && <span className={cn('align-self-start', badge.className)}>{badge.label}</span>}
        </div>
        <button type="button" onClick={toggleTheme} className="btn bd-btn-ghost d-inline-flex align-items-center p-2" aria-label="Toggle theme" title="Toggle theme">
          {theme === 'dark' ? <Sun className="bd-nav-icon" /> : <Moon className="bd-nav-icon" />}
        </button>
      </div>

      {/* Navigation groups */}
      <nav className="d-flex flex-grow-1 flex-column overflow-y-auto px-2 py-3 gap-1">
        {Object.entries(
          visible.reduce<Record<string, NavItem[]>>((acc, item) => {
            acc[item.group] = [...(acc[item.group] || []), item];
            return acc;
          }, {}),
        ).map(([group, items]) => (
          <div key={group} className="d-flex flex-column gap-1">
            <p className="bd-nav-section-title px-3 py-1">{group}</p>
            {items.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => onLinkSelect?.()}
                  className={cn('bd-nav-link', isActive && 'active')}
                  data-bs-dismiss="offcanvas"
                >
                  <item.icon className="bd-nav-icon" />
                  <span className="flex-grow-1 text-truncate">{item.label}</span>
                  {isActive && (
                    <span className="ms-auto d-inline-flex align-items-center" aria-hidden="true">
                      <span className="bd-active-dot" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer actions */}
      <div className="bd-sidebar-footer">
        <Link to="/settings" className="bd-nav-link" onClick={() => onLinkSelect?.()}>
          <UserCog className="bd-nav-icon" />
          <span className="flex-grow-1 text-truncate">Profile &amp; account</span>
        </Link>
        <button type="button" className="bd-nav-link d-inline-flex w-100 p-2" onClick={() => { signOut(); onLinkSelect?.(); }}>
          <LogOut className="bd-nav-icon text-danger" />
          <span>Sign out</span>
        </button>
        <button
          type="button"
          className="bd-nav-link mx-auto d-inline-flex p-2"
          onClick={() => onCollapseToggle?.()}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <ChevronLeft className="bd-nav-icon" />
        </button>
      </div>
    </>
  );
}
