import { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-4">
      {eyebrow && (
        <p className="bd-eyebrow mb-1">{eyebrow}</p>
      )}
      <h1 className="bd-page-title">{title}</h1>
      {description && (
        <p className="mt-2 text-muted bd-fs-md leading-relaxed max-w-3xl">{description}</p>
      )}
      {actions && <div className="d-flex flex-wrap align-items-center gap-2 mt-3">{actions}</div>}
    </div>
  );
}
