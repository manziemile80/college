import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="space-y-2 animate-fade-in">
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <h1 className="page-h1">{title}</h1>
      {description && (
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>
      )}
      {actions && <div className={cn('flex flex-wrap items-center gap-3 pt-1')}>{actions}</div>}
    </div>
  );
}
