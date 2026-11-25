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
        <div className="flex justify-center items-center px-2 py-3">
          <img src={schoolLogo} alt="College De Rebero" width={28} height={28} />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-3">
          {visible.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => onLinkSelect?.()}
                className={cn('relative inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700', isActive && 'bg-emerald-600 text-white')}
                aria-label={item.label}
                title={item.label}
              >
                <item.icon className="w-5 h-5" />
                {isActive && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-white" />}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col items-center gap-1 border-t border-slate-200 dark:border-slate-700 pt-2 px-2 py-3">
          <button type="button" className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => onCollapseToggle?.()} aria-label="Expand sidebar" title="Expand sidebar">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button type="button" className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => { signOut(); onLinkSelect?.(); }} aria-label="Sign out">
            <LogOut className="w-5 h-5 text-red-600" />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Institution header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <img src={schoolLogo} alt="College De Rebero" width={28} height={28} />
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">College De Rebero</p>
          <p className="text-xs text-slate-500 mt-0.5">School &amp; E-Learning</p>
        </div>
      </div>

      {/* User profile section */}
      <div className="flex items-center gap-3 px-3 py-3 cursor-pointer" onClick={() => onLinkSelect?.()}>
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-600 text-white font-semibold text-sm">
          {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{profile?.full_name || 'User'}</p>
          {badge && <span className={cn('self-start text-xs font-semibold px-2 py-0.5 rounded-full', badge.className)}>{badge.label}</span>}
        </div>
        <button type="button" onClick={toggleTheme} className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700" aria-label="Toggle theme" title="Toggle theme">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation groups */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-3 gap-1">
        {Object.entries(
          visible.reduce<Record<string, NavItem[]>>((acc, item) => {
            acc[item.group] = [...(acc[item.group] || []), item];
            return acc;
          }, {}),
        ).map(([group, items]) => (
          <div key={group} className="flex flex-col gap-1">
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</p>
            {items.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => onLinkSelect?.()}
                  className={cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700', isActive && 'bg-emerald-600 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600')}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer actions */}
      <div className="border-t border-slate-200 dark:border-slate-700 px-2 py-3 flex flex-col gap-1">
        <Link to="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700" onClick={() => onLinkSelect?.()}>
          <UserCog className="w-5 h-5 shrink-0" />
          <span className="flex-1 truncate">Profile &amp; account</span>
        </Link>
        <button type="button" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 w-full" onClick={() => { signOut(); onLinkSelect?.(); }}>
          <LogOut className="w-5 h-5 shrink-0 text-red-600" />
          <span>Sign out</span>
        </button>
        <button type="button" className="mx-auto inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => onCollapseToggle?.()} aria-label="Collapse sidebar" title="Collapse sidebar">
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
    </>
  );
}