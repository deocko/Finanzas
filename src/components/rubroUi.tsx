import type { ReactNode, SelectHTMLAttributes } from 'react';
import { rubroTree } from '../lib/rubros';
import type { Rubro } from '../lib/types';
import { cx } from './ui';

/** Selector de rubro agrupado por rubro principal. */
export function RubroSelect({
  rubros, flow, value, onChange, className, ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  rubros: readonly Rubro[];
  flow?: Rubro['flow'];
  value: string;
  onChange: (id: string) => void;
}) {
  const tree = rubroTree(rubros, flow);
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx('block min-h-11 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink', className)}
    >
      {!rubros.some((r) => r.id === value) && <option value={value}>{value ? 'Rubro eliminado' : 'Sin rubro'}</option>}
      {tree.map(({ group, children }) => (
        <optgroup key={group.id} label={group.name}>
          {children.length === 0 && <option value={group.id}>{group.name}</option>}
          {children.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.porClasificar ? ' (por clasificar)' : ''}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Etiqueta «por confirmar» y similares. */
export function Pill({ tone = 'warn', children }: { tone?: 'warn' | 'ok' | 'danger' | 'info' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-ink',
        tone === 'warn' && 'bg-warn-soft',
        tone === 'ok' && 'bg-ok-soft',
        tone === 'danger' && 'bg-danger-soft',
        tone === 'info' && 'bg-brand-soft',
        tone === 'muted' && 'bg-surface-2 text-ink-2',
      )}
    >
      {children}
    </span>
  );
}

export const POR_CONFIRMAR = 'Por confirmar';
