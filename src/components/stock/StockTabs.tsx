import { NavLink } from 'react-router-dom';

const tabs = [
  { label: 'Dashboard', to: '/stock-dashboard' },
  { label: 'Inventory', to: '/stock' },
  { label: 'Stock In', to: '/stock/in' },
  { label: 'Stock Out', to: '/stock/out' },
  { label: 'Batches', to: '/stock/batches' },
  { label: 'Expiry', to: '/stock/expiry' },
  { label: 'Low Stock', to: '/stock/alerts' },
  { label: 'Movements', to: '/stock/movements' },
  { label: 'Reports', to: '/stock/reports' },
  { label: 'Valuation', to: '/stock/valuation' },
];

export function StockTabs() {
  return (
    <nav className="nav nav-pills flex-wrap gap-2 border-bottom border-secondary-subtle pb-3" aria-label="Stock sections">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `nav-link px-3 py-1.5 rounded-pill bd-fs-sm ${isActive ? 'active' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
