import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  PanelLeft,
  PanelRight,
  UserCircle,
  Settings,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SidebarNav } from './SidebarNav';
import { navItems } from './navItems';
import { useAuth } from '@/contexts/AuthContext';

interface AppTopBarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function AppTopBar({ collapsed, onToggleCollapsed }: AppTopBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const visible = navItems.filter((item) => role && item.roles.includes(role));

  return (
    <header className="position-sticky top-0 z-30 border-bottom border-slate-200 bg-white">
      <div className="d-flex h-16 align-items-center gap-2 px-3 sm:px-6">
        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:d-none" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[264px] border-slate-300 bg-sidebar p-0">
            <div className="d-flex h-100 d-flex flex-column" onClick={() => setMobileOpen(false)}>
              <SidebarNav />
            </div>
          </SheetContent>
        </Sheet>

        {/* Desktop collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="d-none lg:d-inline-flex rounded-md"
          onClick={onToggleCollapsed}
          aria-label="Collapse sidebar"
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelRight className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
        </Button>

        {/* Global search */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="group d-flex h-11 flex-1 min-w-40 align-items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-start shadow-sm transition-colors hover:border-emerald-300 hover:shadow-md"
        >
          <Search className="h-4 w-4 text-slate-400 group-hover:text-emerald-600" />
          <span className="flex-1 truncate fs-14.5 text-slate-500">Search anything</span>
          <span className="d-none rounded-md border border-slate-200 px-1.5 py-0.5 fs-10 sm:d-inline">âŒ˜K</span>
        </button>

        {/* Notifications */}
        <div className="d-flex align-items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="position-relative rounded-circle"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-slate-600" />
            <span className="position-absolute right-1 top-1 h-2 w-2 rounded-circle bg-emerald-600" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-circle" aria-label="Notification center">
            <Mail className="h-5 w-5 text-slate-600" />
          </Button>
        </div>

        {/* User profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="d-flex h-10 align-items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-start hover:bg-slate-50"
            >
              <span className="d-flex h-7 w-7 shrink-0 align-items-center justify-content-center rounded-circle bg-emerald-600 fs-13 fw-semibold text-white">
                {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
              <span className="d-none fs-14.5 fw-medium text-slate-900 md:d-block">
                {profile?.full_name || 'User'}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl border-slate-200">
            <DropdownMenuLabel className="fs-14 fw-semibold">
              {profile?.full_name || 'User'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="rounded-lg fs-14">
              <Link to="/settings">
                <UserCircle className="mr-2 h-4.5 w-4.5" />
                Profile &amp; account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg fs-14">
              <Link to="/settings">
                <Settings className="mr-2 h-4.5 w-4.5" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="rounded-lg fs-14">
              <LogOut className="mr-2 h-4.5 w-4.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="overflow-hidden p-0">
          <Command>
            <CommandInput placeholder="Search modules..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Modules">
                {visible.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={item.label}
                    onSelect={() => {
                      setSearchOpen(false);
                      navigate(item.href);
                    }}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </header>
  );
}


