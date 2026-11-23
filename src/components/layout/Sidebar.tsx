import { SidebarNav } from './SidebarNav';

export function Sidebar({ collapsed = false, onCollapseToggle }: { collapsed?: boolean; onCollapseToggle?: () => void }) {
  return (
    <aside className="bd-sidebar d-none d-lg-block" aria-label="Primary navigation">
      <SidebarNav collapsed={collapsed} onCollapseToggle={onCollapseToggle} />
    </aside>
  );
}
