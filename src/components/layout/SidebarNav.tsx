import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { LogOut, Sun, Moon, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import schoolLogo from '@/assets/college-rebero-logo.png';
import { navItems, roleBadges, NavItem } from './navItems';

interface SidebarNavProps {
  collapsed?: boolean;
}

export function SidebarNav({ collapsed = false }: SidebarNavProps) {
  const { role, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const visible = navItems.filter((item) => role && item.roles.includes(role));

  const badge = role ? roleBadges[role] : null;

  if (collapsed) {
    return (
      <>
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border">
          <img src={schoolLogo} alt="College De Rebero" width={32} height={32} className="h-8 w-8 object-contain" />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 py-4">
          {visible.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Button
                key={item.href}
                variant="ghost"
                size="icon"
                asChild
                className="relative h-11 w-11 rounded-3xl p-0 text-white hover:bg-white/10"
              >
                <Link to={item.href} aria-label={item.label} title={item.label}>
                  <item.icon className="h-5 w-5" />
                  {isActive && <span className="absolute -top-1.5 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-emerald-600" />}
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="flex flex-col gap-2 border-t border-sidebar-border px-2 py-3">
          <Button variant="ghost" asChild className="h-10 w-full justify-center rounded-3xl text-white hover:bg-white/10">
            <Link to="/settings">
              <UserCog className="h-5 w-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} className="h-10 w-10 self-center rounded-3xl text-white hover:bg-white/10" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Institution header */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <img src={schoolLogo} alt="College De Rebero" width={32} height={32} className="h-8 w-8 object-contain" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight text-white">College De Rebero</p>
          <p className="truncate text-[11px] leading-tight text-slate-400">School &amp; E-Learning</p>
        </div>
      </div>

      {/* User profile section */}
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
            {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold text-white">{profile?.full_name || 'User'}</p>
            {badge && (
              <span className={cn('mt-0.5 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium', badge.className)}>
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
            <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              {group}
            </p>
            {items.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14.5px] font-medium transition-all duration-200',
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-white" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Logout action */}
      <div className="border-t border-sidebar-border px-4 py-4">
        <Button
          variant="ghost"
          onClick={signOut}
          className="w-full justify-start gap-3 rounded-[12px] text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </>
  );
}
