import { useMemo, useState } from 'react';
import { Camera, Receipt, ShoppingCart } from 'lucide-react';
import { useCol, useData } from '../data/DataContext';
import { formatDate, periodOf, todayISO } from '../lib/dates';
import { formatMXN, sumCents } from '../lib/money';
import { MonthPicker } from '../components/MonthPicker';
import { TicketViewer } from '../components/rows';
import { useSheet } from '../components/SheetHost';
import { Button, EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from '../components/ui';

export function Pantry() {
  const { retry } = useData();
  const { items, loading, error } = useCol('expenses');
  const open = useSheet();
  const [period, setPeriod] = useState(periodOf(todayISO()));
  const list = useMemo(
    () => items.filter((e) => e.category === 'despensa' && periodOf(e.date) === period).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [items, period],
  );
  const total = sumCents(list.map((e) => e.amount));
  const avg = list.length ? Math.round(total / list.length) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Despensa"
        subtitle="Cada compra con su ticket. La lectura automática del ticket llega en la Fase 2."
        action={<Button onClick={() => open({ kind: 'expense', presetCategory: 'despensa' })}><Camera className="size-4" aria-hidden /> Nueva compra</Button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={period} onChange={setPeriod} />
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs font-semibold text-muted">Total del mes</p>
            <p className="num text-2xl font-extrabold text-ink">{formatMXN(total)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">Promedio por compra</p>
            <p className="num text-2xl font-extrabold text-ink">{formatMXN(avg)}</p>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <Panel title={`${list.length} ${list.length === 1 ? 'compra' : 'compras'}`}>
          {loading ? (
            <ListSkeleton />
          ) : list.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-control border border-line p-3">
                  <button
                    type="button"
                    disabled={!e.ticketRef}
                    onClick={() => e.ticketRef && open({ kind: 'custom', title: `Ticket · ${e.store ?? e.concept}`, content: () => <TicketViewer refId={e.ticketRef!} /> })}
                    className="flex size-14 shrink-0 items-center justify-center rounded-control bg-surface-2 text-muted enabled:hover:bg-brand-soft enabled:hover:text-brand disabled:opacity-60"
                    aria-label={e.ticketRef ? 'Ver foto del ticket' : 'Sin foto del ticket'}
                  >
                    <Receipt className="size-6" aria-hidden />
                  </button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open({ kind: 'expense', initial: e })}>
                    <p className="truncate text-sm font-bold text-ink">{e.store || e.concept}</p>
                    <p className="text-xs text-muted">{formatDate(e.date)}{e.ticketRef ? ' · con ticket' : ' · sin ticket'}</p>
                    <p className="num text-lg font-extrabold text-ink">{formatMXN(e.amount)}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ShoppingCart />} title="Sin compras este mes" text="Registra tu compra del súper y toma foto del ticket para tenerlo siempre a la mano." action={<Button onClick={() => open({ kind: 'expense', presetCategory: 'despensa' })}>Registrar compra</Button>} />
          )}
        </Panel>
      )}
    </div>
  );
}
