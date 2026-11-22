import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'warning' | 'danger';
}

export function StatCard({ title, value, subtitle, icon: Icon, variant = 'primary' }: StatCardProps) {
  const variants = {
    primary: {
      icon: 'bg-emerald-600 text-white',
      title: 'text-[13px] font-medium text-white/75',
      value: 'text-[30px] font-bold tracking-tight text-white',
      sub: 'text-[13px] text-white/70',
      bg: 'bg-emerald-600',
      border: 'border-emerald-600',
    },
    secondary: {
      icon: 'bg-slate-200 text-slate-600',
      title: 'text-[13px] font-medium text-slate-500',
      value: 'text-[30px] font-bold tracking-tight text-slate-900',
      sub: 'text-[13px] text-slate-500',
      bg: 'bg-white',
      border: 'border-slate-200',
    },
    tertiary: {
      icon: 'bg-slate-100 text-slate-500',
      title: 'text-[13px] font-medium text-slate-500',
      value: 'text-[30px] font-bold tracking-tight text-slate-900',
      sub: 'text-[13px] text-slate-500',
      bg: 'bg-white',
      border: 'border-slate-200',
    },
    warning: {
      icon: 'bg-amber-100 text-amber-700',
      title: 'text-[13px] font-medium text-amber-700',
      value: 'text-[30px] font-bold tracking-tight text-amber-900',
      sub: 'text-[13px] text-amber-700',
      bg: 'bg-white',
      border: 'border-slate-200',
    },
    danger: {
      icon: 'bg-red-100 text-red-700',
      title: 'text-[13px] font-medium text-red-700',
      value: 'text-[30px] font-bold tracking-tight text-red-900',
      sub: 'text-[13px] text-red-700',
      bg: 'bg-white',
      border: 'border-slate-200',
    },
  };

  const v = variants[variant];

  return (
    <div className={cn('stat-card', v.bg, v.border)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className={v.title}>{title}</p>
          <p className="mt-2 stat-value">{value}</p>
          {subtitle && <p className={cn('mt-1', v.sub)}>{subtitle}</p>}
        </div>
        <div className={cn('stat-card-icon', v.icon)}>
          <Icon className="h-5.5 w-5.5" />
        </div>
      </div>
    </div>
  );
}
