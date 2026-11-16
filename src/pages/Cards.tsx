import { useMemo } from 'react';
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCol, useData } from '../data/DataContext';
import { cardTotals, creditUsage, dueItems } from '../lib/finance';
import { formatDate, todayISO } from '../lib/dates';
import { formatMXN } from '../lib/money';
import { CreditCardVisual } from '../components/CreditCardVisual';
import { daysText, useConfirmDelete } from '../components/rows';
import { useSheet } from '../components/SheetHost';
import { Button, EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, cx } from '../components/ui';

export function Cards() {
  const { store, retry } = useData();
  const { items, loading, error } = useCol('cards');
  const open = useSheet();
  const confirm = useConfirmDelete();
  const today = todayISO();
  const due = useMemo(() => dueItems(items, [], today), [items, today]);
  const totals = cardTotals(items);
  const sorted = [...items].sort((a, b) => (a.kind === b.kind ? a.createdAt - b.createdAt : a.kind === 'credito' ? -1 : 1));

  return (
    <div>
      <PageHeader
        title="Tarjetas"
        subtitle="Solo guardamos los últimos 4 dígitos. Nunca el número completo, CVV ni NIP."
        action={<Button onClick={() => open({ kind: 'card' })}><Plus className="size-4" aria-hidden /> Agregar tarjeta</Button>}
      />
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : loading ? (
        <Panel><ListSkeleton /></Panel>
      ) : !items.length ? (
        <Panel>
          <EmptyState icon={<CreditCard />} title="Aún no tienes tarjetas" text="Agrega tus tarjetas de crédito y débito para ver saldos, fechas de corte y de pago." action={<Button onClick={() => open({ kind: 'card' })}>Agregar tarjeta</Button>} />
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Deuda total en crédito" value={formatMXN(totals.creditDebt)} />
            <Tile label="Crédito disponible" value={formatMXN(totals.creditAvailable)} />
            <Tile label="Saldo en débito" value={formatMXN(totals.debitAvailable)} className="col-span-2 sm:col-span-1" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((c) => {
              const d = due.find((x) => x.sourceId === c.id);
              const usage = creditUsage(c);
              return (
                <article key={c.id} className="rounded-card bg-surface p-4 shadow-card">
                  <CreditCardVisual {...c} balance={c.balance} className="mx-auto" />
                  {c.kind === 'credito' ? (
                    <div className="mt-4 space-y-3 text-sm">
                      {c.creditLimit ? (
                        <div>
                          <div className="flex justify-between text-xs font-semibold text-muted">
                            <span>Uso del crédito</span>
                            <span className="num">{Math.round(usage * 100)} % de {formatMXN(c.creditLimit)}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-surface-2">
                            <div className={cx('h-2 rounded-full', usage > 0.7 ? 'bg-danger' : usage > 0.3 ? 'bg-warn' : 'bg-ok')} style={{ width: `${Math.max(2, usage * 100)}%` }} />
                          </div>
                        </div>
                      ) : null}
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <Item k="Fecha de corte" v={c.cutDay ? `Día ${c.cutDay}` : '—'} />
                        <Item k="Fecha límite" v={c.dueDay ? `Día ${c.dueDay}` : '—'} />
                        <Item k="Pago mínimo" v={c.minPayment !== undefined ? formatMXN(c.minPayment) : '—'} />
                        <Item k="Pago sin intereses" v={c.noInterestPayment !== undefined ? formatMXN(c.noInterestPayment) : '—'} />
                      </dl>
                      {d && (
                        <p
                          className={cx(
                            'rounded-control px-3 py-2 text-xs font-bold',
                            d.semaforo === 'rojo' ? 'bg-danger-soft text-danger' : d.semaforo === 'amarillo' ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok',
                          )}
                          role={d.semaforo === 'rojo' ? 'alert' : undefined}
                        >
                          Próximo pago: {formatDate(d.date)} · {daysText(d.daysLeft)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">Tarjeta de débito</p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => open({ kind: 'card', initial: c })}>
                      <Pencil className="size-4" aria-hidden /> Editar
                    </Button>
                    <Button variant="ghost" aria-label={`Eliminar tarjeta terminación ${c.last4}`} onClick={() => confirm(`la tarjeta •${c.last4}`, () => store.remove('cards', c.id))}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="num font-bold text-ink">{v}</dd>
    </div>
  );
}

function Tile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cx('rounded-card bg-surface p-4 shadow-card', className)}>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="num text-xl font-extrabold text-ink">{value}</p>
    </div>
  );
}
