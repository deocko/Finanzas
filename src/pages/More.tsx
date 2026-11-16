import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { NAV } from '../components/Layout';
import { PageHeader } from '../components/ui';

export function More() {
  return (
    <div>
      <PageHeader title="Más" />
      <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
        {NAV.filter((n) => !n.mobile).map((n) => (
          <li key={n.to}>
            <Link to={n.to} className="flex min-h-16 items-center gap-4 px-4 text-base font-semibold text-ink hover:bg-surface-2">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand"><n.icon className="size-5" aria-hidden /></span>
              <span className="flex-1">{n.label}</span>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
