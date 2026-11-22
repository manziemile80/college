import { cn } from '@/lib/utils';
import { SidebarNav } from './SidebarNav';

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <aside
      className={cn(
        'position-fixed inset-y-0 left-0 z-40 d-flex d-flex flex-column bg-sidebar',
        collapsed ? 'w-14' : 'w-[260px]',
      )}
    >
      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}


