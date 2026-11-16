import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useCol, useData } from '../data/DataContext';
import { expensesByCategory, monthlySeries } from '../lib/finance';
import { addMonths, formatPeriod, periodOf, todayISO } from '../lib/dates';
import { formatMXN } from '../lib/money';
import { CATEGORIES, CATEGORY_ORDER } from '../lib/catalog';
import { centsToCSV, downloadText, toCSV } from '../lib/csv';
import { BalanceLine, CategoryBars, IncomeExpenseChart } from '../components/charts';
import { Button, ErrorState, ListSkeleton, PageHeader, Panel, Segmented, Skeleton } from '../components/ui';

export function Reports() {
  const { retry } = useData();
  const incomes = useCol('incomes');
  const expenses = useCol('expenses');
  const [range, setRange] = useState<'3' | '6' | '12'>('6');
  const n = Number(range);
  const last = periodOf(todayISO());
  const first = addMonths(last, -(n - 1));

  const series = useMemo(() => monthlySeries(last, n, incomes.items, expenses.items), [last, n, incomes.items, expenses.items]);
  const inRange = useMemo(() => expenses.items.filter((e) => periodOf(e.date) >= first && periodOf(e.date) <= last), [expenses.items, first, last]);
  const byCat = useMemo(() => expensesByCategory(inRange), [inRange]);

  // Matriz categoría × mes
  const matrix = useMemo(
    () =>
      CATEGORY_ORDER.map((c) => ({
        c,
        months: series.map((s) => inRange.filter((e) => e.category === c && periodOf(e.date) === s.period).reduce((a, e) => a + e.amount, 0)),
      })).filter((r) => r.months.some((m) => m > 0)),
    [series, inRange],
  );

  function exportSummary() {
    downloadText(
      `resumen-${first}_a_${last}.csv`,
      toCSV(['Mes', 'Ingresos MXN', 'Gastos MXN', 'Balance MXN', 'Balance acumulado MXN'], series.map((s) => [s.period, centsToCSV(s.income), centsToCSV(s.expense), centsToCSV(s.balance), centsToCSV(s.cumulative)])),
    );
  }
  function exportCategories() {
    downloadText(
      `gastos-por-categoria-${first}_a_${last}.csv`,
      toCSV(['Categoría', ...series.map((s) => s.period), 'Total MXN'], matrix.map((r) => [CATEGORIES[r.c].label, ...r.months.map(centsToCSV), centsToCSV(r.months.reduce((a, b) => a + b, 0))])),
    );
  }

  const loading = incomes.loading || expenses.loading;
  const error = incomes.error || expenses.error;
  if (error) return <ErrorState message={error} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        subtitle={`De ${formatPeriod(first, true)} a ${formatPeriod(last, true)}`}
        action={
          <div className="w-64">
            <Segmented label="Periodo" value={range} onChange={setRange} options={[{ value: '3', label: '3 meses' }, { value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Ingresos vs gastos" action={<Button variant="secondary" onClick={exportSummary}><Download className="size-4" aria-hidden /> CSV</Button>}>
          {loading ? <Skeleton className="h-56 w-full" /> : <IncomeExpenseChart data={series} />}
        </Panel>
        <Panel title="Evolución del balance acumulado">
          {loading ? <Skeleton className="h-52 w-full" /> : <BalanceLine data={series.map((s) => ({ period: s.period, value: s.cumulative }))} />}
        </Panel>
      </div>

      <Panel title="Gasto por categoría" action={<Button variant="secondary" onClick={exportCategories} disabled={!matrix.length}><Download className="size-4" aria-hidden /> CSV</Button>}>
        {loading ? <ListSkeleton /> : byCat.length ? <CategoryBars data={byCat} /> : <p className="text-sm text-muted">Sin gastos en el periodo.</p>}
      </Panel>

      <Panel title="Tabla mensual">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Tabla mensual (desliza para ver más)">
          <table className="num w-full min-w-[480px] text-sm">
            <caption className="sr-only">Ingresos, gastos y balance por mes</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-2 pr-3">Mes</th>
                <th scope="col" className="py-2 pr-3 text-right">Ingresos</th>
                <th scope="col" className="py-2 pr-3 text-right">Gastos</th>
                <th scope="col" className="py-2 pr-3 text-right">Balance</th>
                <th scope="col" className="py-2 text-right">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.period} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold capitalize text-ink">{formatPeriod(s.period, true)}</th>
                  <td className="py-2 pr-3 text-right text-ink">{formatMXN(s.income)}</td>
                  <td className="py-2 pr-3 text-right text-ink">{formatMXN(s.expense)}</td>
                  <td className="py-2 pr-3 text-right font-bold text-ink">{formatMXN(s.balance)}</td>
                  <td className="py-2 text-right text-ink-2">{formatMXN(s.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
