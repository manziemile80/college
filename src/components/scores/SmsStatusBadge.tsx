import { CheckCircle, XCircle, Clock, AlertCircle } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface SmsStatusBadgeProps {
  status: string;
  className?: string;
}

export function SmsStatusBadge({ status, className }: SmsStatusBadgeProps) {
  const statusConfig = {
    sent: {
      icon: CheckCircle,
      label: 'Sent',
      className: 'text-bg-success bg-success-subtle',
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      className: 'text-bg-warning bg-warning-subtle',
    },
    failed: {
      icon: XCircle,
      label: 'Failed',
      className: 'text-bg-danger bg-danger-subtle',
    },
    unknown: {
      icon: AlertCircle,
      label: 'Unknown',
      className: 'text-bg-secondary bg-secondary-subtle',
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'badge d-inline-flex align-items-center gap-1 bd-fs-xs',
        config.className,
        className
      )}
    >
      <Icon className="fs-6" />
      {config.label}
    </span>
  );
}
