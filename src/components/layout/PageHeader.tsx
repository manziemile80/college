import { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{eyebrow}</p>
      )}
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      {description && (
        <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-3xl">{description}</p>
      )}
      {actions && <div className="flex flex-wrap items-center gap-2 mt-4">{actions}</div>}
    </div>
  );
}