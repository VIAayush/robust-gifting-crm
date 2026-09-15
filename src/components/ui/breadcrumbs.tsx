import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type Crumb = {
  label: string;
  href?: string;
};

/**
 * Light-weight trail for nested pages, e.g.
 * Companies / Acme Corporation / Contacts / John Doe
 * The final crumb is the current page and is never a link.
 */
export function Breadcrumbs({ items, className = '' }: { items: Crumb[]; className?: string }) {
  const trail = items.filter(Boolean);
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center flex-wrap gap-1 text-xs ${className}`}>
      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1;
        return (
          <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && <ChevronRight size={12} className="text-[var(--color-muted-fg)]" aria-hidden="true" />}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span
                className={isLast ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'}
                aria-current={isLast ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * Standard page heading: title, one-line description and an optional primary action.
 */
export function PageHeader({
  title,
  description,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}>
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
        {description && <p className="text-xs text-[var(--color-text-secondary)] mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
