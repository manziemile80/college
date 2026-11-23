import { LucideIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'warning' | 'danger';
}

export function StatCard({ title, value, subtitle, icon: Icon, variant = 'primary' }: StatCardProps) {
  const iconClass = variant === 'primary'
    ? 'bd-icon-circle-primary'
    : (variant === 'warning' || variant === 'danger')
      ? 'bd-icon-circle-danger'
      : 'bd-icon-circle-muted';

  return (
    <div className="bd-stat-card">
      <div className="min-w-0">
        <p className="text-muted bd-fs-sm fw-semibold">{title}</p>
        <p className={cn('bd-stat-value', variant === 'danger' && 'text-danger', variant === 'warning' && 'text-danger')}>{value}</p>
        {subtitle && <p className="mt-1 bd-fs-sm text-muted">{subtitle}</p>}
      </div>
      <div className={cn('bd-icon-circle', iconClass)}>
        <Icon />
      </div>
    </div>
  );
}
