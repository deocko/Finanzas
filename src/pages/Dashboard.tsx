import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BellRing, ChartPie, ChevronRight, CreditCard, Wallet } from 'lucide-react';
import { useCol, useData } from '../data/DataContext';
import { cardTotals, dueItems, expensesByCategory, monthSummary } from '../lib/finance';
import { formatPeriod, periodOf, todayISO } from '../lib/dates';
import { formatMXN } from '../lib/money';
import { CategoryBars } from '../components/charts';
import { DueRow, ExpenseRow, IncomeRow, daysText } from '../components/rows';
import { useSheet } from '../components/SheetHost';
import { Button, EmptyState, ErrorState, ListSkeleton, Panel, Skeleton, cx } from '../components/ui';

export function Dashboard() {
  const { retry } = useData();
  const incomes = useCol('incomes');
  const expenses = useCol('expenses');
  const cards = useCol('cards');
  const bills = useCol('bills');
  const open = useSheet();
  const today = todayISO();
  const period = periodOf(today);

  const summary = useMemo(() => monthSummary(period, incomes.items, expenses.items), [period, incomes.items, expenses.items]);
  const byCat = useMemo(() => expensesByCategory(expenses.items, period), [expenses.items, period]);
  const due = useMemo(() => dueItems(cards.items, bills.items, today), [cards.items, bills.items, today]);
  const totals = useMemo(() => cardTotals(cards.items), [cards.items]);
  const urgent = due.filter((d) => d.semaforo === 'rojo');
  const recent = useMemo(
    () =>
      [
        ...incomes.items.map((i) => ({ kind: 'i' as const, date: i.date, at: i.createdAt, i })),
        ...expenses.items.map((e) => ({ kind: 'e' as const, date: e.date, at: e.createdAt, e })),
      ]
        .sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1))
        .slice(0, 5),
    [incomes.items, expenses.items],
  );

  const loading = incomes.loading || expenses.loading;
  const error = incomes.error || expenses.error || cards.error || bills.error;
  if (error) return <ErrorState message={error} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold capitalize text-muted">{formatPeriod(period, true)}</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Tu mes en un vistazo</h1>
      </div>

      {urgent.length > 0 && (
        <Link
          to="/vencimientos"
          className="flex items-center gap-3 rounded-card border-2 border-danger bg-danger-soft p-4 text-ink"
        >
          <BellRing className="size-6 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{urgent.length === 1 ? 'Tienes 1 pago urgente' : `Tienes ${urgent.length} pagos urgentes`}</p>
            <p className="truncate text-sm">
              {urgent[0]!.name}: {daysText(urgent[0]!.daysLeft).toLowerCase()} · {formatMXN(urgent[0]!.amount)}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0" aria-hidden />
        </Link>
      )}

      {/* Balance del mes */}
      <section className="rounded-card bg-brand p-6 text-brand-ink shadow-card" aria-labelledby="bal">
        <p id="bal" className="text-sm font-semibold opacity-90">Balance del mes</p>
        {loading ? (
          <Skeleton className="mt-2 h-12 w-48 bg-white/30" />
        ) : (
          <p className="num mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{formatMXN(summary.balance)}</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-control bg-white/15 p-3 dark:bg-black/10">
            <p className="flex items-center gap-1 text-xs font-semibold"><ArrowUpRight className="size-4" aria-hidden /> Ingresos</p>
            <p className="num text-lg font-bold sm:text-xl">{formatMXN(summary.income)}</p>
          </div>
          <div className="rounded-control bg-white/15 p-3 dark:bg-black/10">
            <p className="flex items-center gap-1 text-xs font-semibold"><ArrowDownRight className="size-4" aria-hidden /> Gastos</p>
            <p className="num text-lg font-bold sm:text-xl">{formatMXN(summary.expense)}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Gasto por categoría" action={<Link to="/reportes" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand">Reportes</Link>}>
          {expenses.loading ? (
            <ListSkeleton />
          ) : byCat.length ? (
            <CategoryBars data={byCat} />
          ) : (
            <EmptyState icon={<ChartPie />} title="Sin gastos este mes" text="Registra tu primer gasto y aquí verás en qué se va tu dinero." action={<Button onClick={() => open({ kind: 'expense' })}>Registrar gasto</Button>} />
          )}
        </Panel>

        <Panel title="Próximos vencimientos" action={<Link to="/vencimientos" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand">Ver todos</Link>}>
          {bills.loading || cards.loading ? (
            <ListSkeleton />
          ) : due.length ? (
            <ul className="divide-y divide-line">{due.slice(0, 5).map((d) => <DueRow key={d.key} item={d} />)}</ul>
          ) : (
            <EmptyState icon={<BellRing />} title="Sin vencimientos" text="Agrega tus servicios, colegiaturas y tarjetas para que te avisemos a tiempo." action={<Button onClick={() => open({ kind: 'bill' })}>Agregar vencimiento</Button>} />
          )}
        </Panel>

        <Panel title="Tarjetas" action={<Link to="/tarjetas" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand">Administrar</Link>}>
          {cards.loading ? (
            <ListSkeleton rows={2} />
          ) : cards.items.length ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<CreditCard />} label="Deuda en crédito" value={formatMXN(totals.creditDebt)} />
              <Stat icon={<Wallet />} label="Disponible en débito" value={formatMXN(totals.debitAvailable)} />
              <Stat label="Crédito disponible" value={formatMXN(totals.creditAvailable)} className="col-span-2" />
            </div>
          ) : (
            <EmptyState icon={<CreditCard />} title="Sin tarjetas" text="Agrega tus tarjetas para ver saldos y fechas de pago." action={<Button onClick={() => open({ kind: 'card' })}>Agregar tarjeta</Button>} />
          )}
        </Panel>

        <Panel title="Movimientos recientes" action={<Link to="/movimientos" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand">Ver todos</Link>}>
          {loading ? (
            <ListSkeleton />
          ) : recent.length ? (
            <ul className="divide-y divide-line">
              {recent.map((r) => (r.kind === 'i' ? <IncomeRow key={r.i.id} i={r.i} /> : <ExpenseRow key={r.e.id} e={r.e} />))}
            </ul>
          ) : (
            <EmptyState icon={<Wallet />} title="Aún no hay movimientos" text="Empieza registrando tu sueldo o tu primer gasto." action={<Button onClick={() => open({ kind: 'income' })}>Registrar ingreso</Button>} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, className }: { icon?: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={cx('rounded-control bg-surface-2 p-3', className)}>
      <p className="flex items-center gap-1 text-xs font-semibold text-muted [&>svg]:size-4">{icon}{label}</p>
      <p className="num text-lg font-bold text-ink sm:text-xl">{value}</p>
    </div>
  );
}
