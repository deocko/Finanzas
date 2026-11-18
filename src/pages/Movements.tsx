import { useMemo, useState } from 'react';
import { Download, MailPlus, Receipt, Wallet } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCol, useData } from '../data/DataContext';
import { CATEGORIES, CATEGORY_ORDER, INCOME_TYPES, PAYMENT_METHODS } from '../lib/catalog';
import { formatDate, periodOf, todayISO } from '../lib/dates';
import { formatMXN, sumCents } from '../lib/money';
import { centsToCSV, downloadText, toCSV } from '../lib/csv';
import type { ExpenseCategory } from '../lib/types';
import { MonthPicker } from '../components/MonthPicker';
import { ExpenseRow, IncomeRow } from '../components/rows';
import { useSheet } from '../components/SheetHost';
import { Button, EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, Segmented, cx } from '../components/ui';

export function Movements() {
  const { retry } = useData();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'ingresos' ? 'ingresos' : 'gastos';
  const [period, setPeriod] = useState(periodOf(todayISO()));
  const [cat, setCat] = useState<ExpenseCategory | 'todas'>('todas');
  const incomes = useCol('incomes');
  const expenses = useCol('expenses');
  const open = useSheet();

  const exp = useMemo(
    () => expenses.items.filter((e) => periodOf(e.date) === period && (cat === 'todas' || e.category === cat)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [expenses.items, period, cat],
  );
  const inc = useMemo(
    () => incomes.items.filter((i) => periodOf(i.date) === period).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [incomes.items, period],
  );

  const groups = useMemo(() => {
    const m = new Map<string, typeof exp>();
    for (const e of exp) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [exp]);

  function exportCSV() {
    if (tab === 'gastos') {
      downloadText(
        `gastos-${period}.csv`,
        toCSV(['Fecha', 'Concepto', 'Categoría', 'Método', 'Tienda', 'Monto MXN'], exp.map((e) => [e.date, e.concept, CATEGORIES[e.category].label, PAYMENT_METHODS[e.method], e.store ?? '', centsToCSV(e.amount)])),
      );
    } else {
      downloadText(`ingresos-${period}.csv`, toCSV(['Fecha', 'Concepto', 'Tipo', 'Monto MXN'], inc.map((i) => [i.date, i.concept, INCOME_TYPES[i.type].label, centsToCSV(i.amount)])));
    }
  }

  const error = incomes.error || expenses.error;
  const loading = tab === 'gastos' ? expenses.loading : incomes.loading;
  const total = tab === 'gastos' ? sumCents(exp.map((e) => e.amount)) : sumCents(inc.map((i) => i.amount));

  return (
    <div>
      <PageHeader title="Movimientos" subtitle="Tus ingresos y gastos, mes por mes." action={<div className="flex flex-wrap items-center gap-2"><Link to="/importar" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2"><MailPlus className="size-4" aria-hidden /> Importar del correo</Link><MonthPicker value={period} onChange={setPeriod} /></div>} />
      <div className="mb-4 max-w-sm">
        <Segmented
          label="Ver"
          value={tab}
          onChange={(v) => setParams(v === 'ingresos' ? { tab: v } : {}, { replace: true })}
          options={[{ value: 'gastos', label: 'Gastos' }, { value: 'ingresos', label: 'Ingresos' }]}
        />
      </div>

      {tab === 'gastos' && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrar por categoría">
          {(['todas', ...CATEGORY_ORDER] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={cx(
                'flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold',
                cat === c ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-ink-2',
              )}
            >
              {c !== 'todas' && <span className="size-2.5 rounded-full" style={{ background: CATEGORIES[c].color }} aria-hidden />}
              {c === 'todas' ? 'Todas' : CATEGORIES[c].label}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <Panel
          title={
            <span>
              Total: <span className="num">{formatMXN(total)}</span>
            </span>
          }
          action={
            <Button variant="secondary" onClick={exportCSV} disabled={tab === 'gastos' ? !exp.length : !inc.length}>
              <Download className="size-4" aria-hidden /> CSV
            </Button>
          }
        >
          {loading ? (
            <ListSkeleton rows={5} />
          ) : tab === 'gastos' ? (
            exp.length ? (
              <div className="space-y-4">
                {groups.map(([date, list]) => (
                  <div key={date}>
                    <h3 className="flex justify-between border-b border-line pb-1 text-xs font-bold uppercase tracking-wide text-muted">
                      <span>{formatDate(date)}</span>
                      <span className="num">{formatMXN(sumCents(list.map((e) => e.amount)))}</span>
                    </h3>
                    <ul className="divide-y divide-line">{list.map((e) => <ExpenseRow key={e.id} e={e} showDate={false} />)}</ul>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Receipt />} title="Sin gastos" text="No hay gastos en este mes con este filtro." action={<Button onClick={() => open({ kind: 'expense' })}>Registrar gasto</Button>} />
            )
          ) : inc.length ? (
            <ul className="divide-y divide-line">{inc.map((i) => <IncomeRow key={i.id} i={i} />)}</ul>
          ) : (
            <EmptyState
              icon={<Wallet />}
              title="Sin ingresos"
              text="Registra tu sueldo, aguinaldo o prima vacacional."
              action={<Button onClick={() => open({ kind: 'income' })}>Registrar ingreso</Button>}
            />
          )}
        </Panel>
      )}
    </div>
  );
}
