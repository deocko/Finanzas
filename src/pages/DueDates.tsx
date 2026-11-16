import { useMemo, useState } from 'react';
import { CalendarCheck, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCol, useData, humanError } from '../data/DataContext';
import { dueItems, type DueItem } from '../lib/finance';
import { todayISO } from '../lib/dates';
import { formatMXN } from '../lib/money';
import { CATEGORIES } from '../lib/catalog';
import { DueRow, useConfirmDelete } from '../components/rows';
import { CategoryBadge } from '../components/icons';
import { useSheet } from '../components/SheetHost';
import { Button, EmptyState, ErrorState, IconButton, ListSkeleton, PageHeader, Panel, useToast } from '../components/ui';

function MarkPaid({ item, close }: { item: DueItem; close: () => void }) {
  const { store } = useData();
  const cards = useCol('cards').items;
  const bills = useCol('bills').items;
  const toast = useToast();
  const [register, setRegister] = useState(item.source === 'pago');
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      if (item.source === 'tarjeta') {
        const c = cards.find((x) => x.id === item.sourceId);
        if (c) await store.update('cards', c.id, { paidPeriods: [...(c.paidPeriods ?? []), item.period] });
      } else {
        const b = bills.find((x) => x.id === item.sourceId);
        if (b) await store.update('bills', b.id, { paidPeriods: [...(b.paidPeriods ?? []), item.period] });
        if (b && register) {
          await store.add('expenses', { date: todayISO(), concept: b.name, amount: b.amount, category: b.category, method: 'transferencia' });
        }
      }
      toast('Marcado como pagado');
      close();
    } catch (e) {
      toast(humanError(e), 'error');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-base text-ink">
        ¿Marcar <strong>{item.name}</strong> ({formatMXN(item.amount)}) como pagado?
      </p>
      {item.source === 'pago' && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink-2">
          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={register} onChange={(e) => setRegister(e.target.checked)} />
          Registrarlo también como gasto de hoy
        </label>
      )}
      {item.source === 'tarjeta' && <p className="text-sm text-muted">Recuerda actualizar el saldo de la tarjeta cuando llegue tu estado de cuenta.</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={close}>Cancelar</Button>
        <Button onClick={go} loading={busy}><Check className="size-4" aria-hidden /> Pagado</Button>
      </div>
    </div>
  );
}

export function DueDates() {
  const { store, retry } = useData();
  const cards = useCol('cards');
  const bills = useCol('bills');
  const open = useSheet();
  const confirm = useConfirmDelete();
  const today = todayISO();
  const items = useMemo(() => dueItems(cards.items, bills.items, today), [cards.items, bills.items, today]);
  const counts = { rojo: 0, amarillo: 0, verde: 0, ...Object.fromEntries((['rojo', 'amarillo', 'verde'] as const).map((s) => [s, items.filter((i) => i.semaforo === s).length])) };
  const error = cards.error || bills.error;
  const loading = cards.loading || bills.loading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vencimientos"
        subtitle="Todos tus pagos próximos, ordenados por fecha."
        action={<Button onClick={() => open({ kind: 'bill' })}><Plus className="size-4" aria-hidden /> Agregar pago</Button>}
      />

      <div className="grid grid-cols-3 gap-3" aria-label="Resumen del semáforo">
        <Sem n={counts.rojo} label="Urgentes" sub="≤ 3 días o vencidos" cls="bg-danger-soft" dot="bg-danger" />
        <Sem n={counts.amarillo} label="Próximos" sub="4 a 7 días" cls="bg-warn-soft" dot="bg-warn" />
        <Sem n={counts.verde} label="A tiempo" sub="más de 7 días" cls="bg-ok-soft" dot="bg-ok" />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <Panel title="Próximos pagos">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : items.length ? (
            <ul className="divide-y divide-line">
              {items.map((d) => (
                <DueRow
                  key={d.key}
                  item={d}
                  action={
                    <IconButton label={`Marcar ${d.name} como pagado`} className="border border-line" onClick={() => open({ kind: 'custom', title: 'Marcar como pagado', content: (close) => <MarkPaid item={d} close={close} /> })}>
                      <Check className="size-5" aria-hidden />
                    </IconButton>
                  }
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CalendarCheck />} title="Nada por pagar" text="Agrega servicios (luz, agua, gas, teléfono), colegiaturas o tarjetas de crédito con su fecha límite." action={<Button onClick={() => open({ kind: 'bill' })}>Agregar pago</Button>} />
          )}
        </Panel>
      )}

      {bills.items.length > 0 && (
        <Panel title="Pagos registrados">
          <ul className="divide-y divide-line">
            {bills.items.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-3">
                <CategoryBadge category={b.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{b.name}</p>
                  <p className="text-xs text-muted">
                    {CATEGORIES[b.category].label} · {b.recurrence === 'mensual' ? `Cada mes, día ${b.dueDay}` : `Una vez`}
                  </p>
                </div>
                <p className="num text-sm font-bold text-ink">{formatMXN(b.amount)}</p>
                <IconButton label={`Editar ${b.name}`} onClick={() => open({ kind: 'bill', initial: b })}><Pencil className="size-4" aria-hidden /></IconButton>
                <IconButton label={`Eliminar ${b.name}`} onClick={() => confirm(`«${b.name}»`, () => store.remove('bills', b.id))}><Trash2 className="size-4" aria-hidden /></IconButton>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Sem({ n, label, sub, cls, dot }: { n: number; label: string; sub: string; cls: string; dot: string }) {
  return (
    <div className={`rounded-card p-3 ${cls}`}>
      <p className="flex items-center gap-2 text-xs font-bold text-ink"><span className={`size-2.5 rounded-full ${dot}`} aria-hidden />{label}</p>
      <p className="num text-3xl font-extrabold text-ink">{n}</p>
      <p className="text-[11px] text-ink-2">{sub}</p>
    </div>
  );
}
