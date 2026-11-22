import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, LogOut, Sun, Moon, UserCog } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import schoolLogo from '@/assets/college-rebero-logo.png';
import { navItems, roleBadges, NavItem } from './navItems';

interface SidebarNavProps {
  collapsed?: boolean;
  /** Called when a navigation link is selected (closes the mobile Sheet). */
  onLinkSelect?: () => void;
  /** Called by the expand/collapse button (provided at tablet width). */
  onCollapseToggle?: () => void;
}

export function SidebarNav({ collapsed = false, onLinkSelect, onCollapseToggle }: SidebarNavProps) {
  const { role, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const visible = navItems.filter((item) => role && item.roles.includes(role));

  const badge = role ? roleBadges[role] : null;

  if (collapsed) {
    return (
      <>
        <div className="d-flex h-16 align-items-center justify-content-center border-bottom border-sidebar-border">
          <img src={schoolLogo} alt="College De Rebero" width={32} height={32} className="h-8 w-8 object-contain" />
        </div>
        <nav className="d-flex flex-1 d-flex flex-column align-items-center g-1.5 overflow-y-auto px-2 py-4">
          {visible.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Button
                key={item.href}
                variant="ghost"
                size="icon"
                asChild
                className="position-relative h-11 w-11 rounded-3xl p-0 text-white hover:bg-white/10"
              >
                <Link to={item.href} aria-label={item.label} title={item.label} onClick={() => onLinkSelect?.()}>
                  <item.icon className="h-5 w-5" />
                  {isActive && <span className="position-absolute -top-1.5 left-1/2 h-1 w-6 -translate-x-1/2 rounded-circle bg-emerald-600" />}
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="d-flex d-flex flex-column g-2 border-top border-sidebar-border px-2 py-3">
          <Button variant="ghost" asChild className="h-10 w-100 justify-content-center rounded-3xl text-white hover:bg-white/10" onClick={() => onLinkSelect?.()}>
            <Link to="/settings">
              <UserCog className="h-5 w-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { signOut(); onLinkSelect?.(); }} className="h-10 w-10 self-center rounded-3xl text-white hover:bg-white/10" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onCollapseToggle?.()} className="mx-auto h-10 w-10 rounded-3xl text-white hover:bg-white/10" aria-label="Expand sidebar">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Institution header */}
      <div className="d-flex h-16 align-items-center g-3 border-bottom border-sidebar-border px-6">
        <img src={schoolLogo} alt="College De Rebero" width={32} height={32} className="h-8 w-8 object-contain" />
        <div className="min-w-0">
          <p className="truncate fs-15 fw-bold leading-tight text-white">College De Rebero</p>
          <p className="truncate fs-11 leading-tight text-slate-400">School &amp; E-Learning</p>
        </div>
      </div>

      {/* User profile section */}
      <div className="border-bottom border-sidebar-border px-5 py-5" onClick={() => onLinkSelect?.()}>
        <div className="d-flex align-items-center g-3">
          <div className="d-flex h-10 w-10 shrink-0 align-items-center justify-content-center rounded-circle bg-emerald-600 fs-sm fw-semibold text-white">
            {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate fs-14.5 fw-semibold text-white">{profile?.full_name || 'User'}</p>
            {badge && (
              <span className={cn('mt-0.5 d-inline-flex rounded-circle px-2.5 py-0.5 fs-11 fw-medium', badge.className)}>
                {badge.label}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        {Object.entries(
          visible.reduce<Record<string, NavItem[]>>((acc, item) => {
            acc[item.group] = [...(acc[item.group] || []), item];
            return acc;
          }, {}),
        ).map(([group, items]) => (
          <div key={group} className="space-y-1">
            <p className="px-3 pb-2 pt-1 fs-11 fw-semibold text-uppercase tracking-widest text-slate-400">
              {group}
            </p>
            {items.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => onLinkSelect?.()}
                  className={cn(
                    'nav-item-link group d-flex align-items-center g-3 rounded-[12px] px-3 py-3 fs-14.5 fw-medium transition-all duration-200',
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && <span className="ms-auto h-1.5 w-1.5 shrink-0 rounded-circle bg-white" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse button (tablet) */}
      <div className="border-top border-sidebar-border px-4 py-3 d-flex justify-content-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapseToggle?.()}
          className="h-10 w-10 rounded-3xl text-slate-300 hover:bg-white/10"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
    </>
  );
}




