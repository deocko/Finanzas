import { useEffect, useState } from 'react';
import { Receipt, Trash2 } from 'lucide-react';
import { CATEGORIES, INCOME_TYPES, PAYMENT_METHODS } from '../lib/catalog';
import { formatMXN } from '../lib/money';
import { formatDate } from '../lib/dates';
import type { DueItem } from '../lib/finance';
import type { Expense, Income } from '../lib/types';
import { useData, humanError } from '../data/DataContext';
import { CategoryBadge, IncomeBadge } from './icons';
import { useSheet } from './SheetHost';
import { Button, ErrorState, IconButton, Skeleton, cx, useToast } from './ui';

export function ConfirmDelete({ what, onConfirm, close }: { what: string; onConfirm: () => Promise<void>; close: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-base text-ink">¿Eliminar {what}? Esta acción no se puede deshacer.</p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={close}>Cancelar</Button>
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              toast('Eliminado');
              close();
            } catch (e) {
              toast(humanError(e), 'error');
              setBusy(false);
            }
          }}
        >
          <Trash2 className="size-4" aria-hidden /> Eliminar
        </Button>
      </div>
    </div>
  );
}

export function useConfirmDelete() {
  const open = useSheet();
  return (what: string, onConfirm: () => Promise<void>) =>
    open({ kind: 'custom', title: 'Confirmar', content: (close) => <ConfirmDelete what={what} onConfirm={onConfirm} close={close} /> });
}

export function TicketViewer({ refId }: { refId: string }) {
  const { store } = useData();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setErr(null);
    store.ticketUrl(refId).then((u) => alive && setUrl(u), (e) => alive && setErr(humanError(e)));
    return () => { alive = false; };
  }, [store, refId, n]);
  if (err) return <ErrorState message={err} onRetry={() => setN((x) => x + 1)} />;
  if (!url) return <Skeleton className="h-96 w-full" />;
  return <img src={url} alt="Foto del ticket" className="mx-auto max-h-[70dvh] rounded-control object-contain" />;
}

export function ExpenseRow({ e, showDate = true }: { e: Expense; showDate?: boolean }) {
  const open = useSheet();
  const { store } = useData();
  const confirm = useConfirmDelete();
  return (
    <li className="flex items-center gap-1">
      <button type="button" onClick={() => open({ kind: 'expense', initial: e })} className="flex min-w-0 flex-1 items-center gap-3 rounded-control py-3 text-left hover:bg-surface-2" aria-label={`Editar ${e.concept}, ${formatMXN(e.amount)}`}>
        <CategoryBadge category={e.category} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{e.concept}</p>
          <p className="truncate text-xs text-muted">
            {CATEGORIES[e.category].label}
            {e.store ? ` · ${e.store}` : ''} · {PAYMENT_METHODS[e.method]}
            {showDate ? ` · ${formatDate(e.date)}` : ''}
          </p>
        </div>
        <p className="num shrink-0 pr-1 text-right text-sm font-bold text-ink">−{formatMXN(e.amount)}</p>
      </button>
      {e.ticketRef && (
        <IconButton label="Ver ticket" onClick={() => open({ kind: 'custom', title: 'Ticket', content: () => <TicketViewer refId={e.ticketRef!} /> })}>
          <Receipt className="size-4" aria-hidden />
        </IconButton>
      )}
      <span className="hidden sm:contents">
        <IconButton
          label={`Eliminar ${e.concept}`}
          onClick={() =>
            confirm(`el gasto «${e.concept}»`, async () => {
              await store.remove('expenses', e.id);
              if (e.ticketRef) await store.deleteTicket(e.ticketRef).catch(() => undefined);
            })
          }
        >
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      </span>
    </li>
  );
}

export function IncomeRow({ i }: { i: Income }) {
  const open = useSheet();
  const { store } = useData();
  const confirm = useConfirmDelete();
  return (
    <li className="flex items-center gap-1">
      <button type="button" onClick={() => open({ kind: 'income', initial: i })} className="flex min-w-0 flex-1 items-center gap-3 rounded-control py-3 text-left hover:bg-surface-2" aria-label={`Editar ${i.concept}, ${formatMXN(i.amount)}`}>
        <IncomeBadge type={i.type} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{i.concept}</p>
          <p className="truncate text-xs text-muted">{INCOME_TYPES[i.type].label} · {formatDate(i.date)}</p>
        </div>
        <p className="num shrink-0 pr-1 text-sm font-bold text-ink">+{formatMXN(i.amount)}</p>
      </button>
      <span className="hidden sm:contents">
        <IconButton label={`Eliminar ${i.concept}`} onClick={() => confirm(`el ingreso «${i.concept}»`, () => store.remove('incomes', i.id))}>
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      </span>
    </li>
  );
}

const SEM = {
  rojo: { label: 'Urgente', cls: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  amarillo: { label: 'Próximo', cls: 'bg-warn-soft text-warn', dot: 'bg-warn' },
  verde: { label: 'A tiempo', cls: 'bg-ok-soft text-ok', dot: 'bg-ok' },
} as const;

export function daysText(d: number): string {
  if (d < -1) return `Venció hace ${-d} días`;
  if (d === -1) return 'Venció ayer';
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  return `Faltan ${d} días`;
}

export function DueRow({ item, action }: { item: DueItem; action?: React.ReactNode }) {
  const s = SEM[item.semaforo];
  return (
    <li className="flex items-center gap-3 py-3">
      <CategoryBadge category={item.category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
        <p className="text-xs text-muted">{formatDate(item.date)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-sm font-bold text-ink">{formatMXN(item.amount)}</p>
        <span className={cx('mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', s.cls)}>
          <span className={cx('size-2 rounded-full', s.dot)} aria-hidden />
          {daysText(item.daysLeft)}
          <span className="sr-only">({s.label})</span>
        </span>
      </div>
      {action}
    </li>
  );
}
