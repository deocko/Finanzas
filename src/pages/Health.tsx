import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, HeartPulse, Lightbulb, Repeat, ShieldCheck } from 'lucide-react';
import { useCol } from '../data/DataContext';
import { useHealth } from '../data/useHealth';
import { formatDate, periodOf } from '../lib/dates';
import { formatMXN, sumCents } from '../lib/money';
import { rule503020, subscriptions } from '../lib/health';
import type { FinAlert } from '../lib/alerts';
import { MonthPicker } from '../components/MonthPicker';
import { EmptyState, PageHeader, Panel, cx } from '../components/ui';

export function HealthPage() {
  const incomes = useCol('incomes').items;
  const expenses = useCol('expenses').items;
  const inbox = useCol('inbox').items;
  const { fund, alerts, weekly, habits, today } = useHealth();
  const [period, setPeriod] = useState(periodOf(today));
  const r = useMemo(() => rule503020(period, incomes, expenses, habits), [period, incomes, expenses, habits]);
  const subs = useMemo(() => subscriptions(inbox), [inbox]);
  const subsTotal = sumCents(subs.map((s) => s.monthly));

  return (
    <div className="space-y-6">
      <PageHeader title="Salud financiera" subtitle="Guías y avisos. La app nunca mueve dinero ni cancela nada: tú decides." action={<Link to="/ajustes#habitos" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand">Configurar</Link>} />

      <Panel title={<span className="flex items-center gap-2"><Lightbulb className="size-5" aria-hidden /> Resumen semanal</span>}>
        <p className="mb-3 text-sm text-muted">
          Últimos 7 días: <span className="num font-semibold text-ink">{formatMXN(weekly.week)}</span> en gastos
          {weekly.prevWeek > 0 ? <> (semana anterior: <span className="num">{formatMXN(weekly.prevWeek)}</span>)</> : null}.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink" data-testid="recomendaciones">
          {weekly.recs.map((x) => <li key={x.id}>{x.text}</li>)}
        </ol>
      </Panel>

      <AlertsPanel alerts={alerts} />

      <Panel title="Regla 50/30/20" action={<MonthPicker value={period} onChange={setPeriod} />}>
        {r.income <= 0 ? (
          <p className="text-sm text-muted">No hay ingresos registrados en este mes; sin ingreso no se pueden calcular los porcentajes.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">Ingreso del mes: <span className="num font-semibold text-ink">{formatMXN(r.income)}</span></p>
            <Bucket label="Necesidades" real={r.needsPct} target={habits.needsPct} amount={r.needs} targetAmount={r.target.needs} over />
            <Bucket label="Deseos" real={r.wantsPct} target={habits.wantsPct} amount={r.wants} targetAmount={r.target.wants} over />
            <Bucket label="Ahorro (lo que queda)" real={r.savingsPct} target={habits.savingsPct} amount={r.savings} targetAmount={r.target.savings} />
          </div>
        )}
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><ShieldCheck className="size-5" aria-hidden /> Fondo de emergencia</span>}>
        {!fund.configured ? (
          <p className="text-sm text-muted">Elige en <Link to="/ajustes#habitos" className="font-semibold text-brand">Ajustes</Link> la cuenta donde guardas tu fondo de emergencia para ver el progreso.</p>
        ) : fund.goal <= 0 ? (
          <p className="text-sm text-muted">Aún no hay gasto esencial suficiente para calcular la meta. Registra tus gastos o fija tu gasto esencial mensual en Ajustes.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="num text-2xl font-extrabold text-ink">{formatMXN(fund.current)} <span className="text-base font-semibold text-muted">de {formatMXN(fund.goal)}</span></p>
              <p className="text-sm font-semibold text-ink-2">{Math.round(fund.progress * 100)} %</p>
            </div>
            <Progress value={fund.progress} />
            <p className="text-sm text-ink-2">
              Meta: {habits.emergencyMonths} meses × {formatMXN(fund.essential)} de gasto esencial. Para llegar en {habits.emergencyHorizonMonths} meses, aparta <span className="num font-semibold">{formatMXN(fund.suggestedMonthly)}</span> al mes.
              {' '}Este mes llevas <span className="num font-semibold">{formatMXN(fund.contributedThisMonth)}</span> aportados.
            </p>
          </div>
        )}
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><Repeat className="size-5" aria-hidden /> Auditoría de suscripciones</span>}>
        {!subs.length ? (
          <p className="text-sm text-muted">No se han detectado suscripciones ni cargos recurrentes. Aparecen al importar el archivo de Byte.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-2">Total mensual: <span className="num font-bold text-ink" data-testid="total-suscripciones">{formatMXN(subsTotal)}</span> · {subs.length} {subs.length === 1 ? 'cargo' : 'cargos'}. Revisa cuáles sigues usando; cancelarlas lo haces tú en cada servicio.</p>
            <ul className="divide-y divide-line">
              {subs.map((s) => (
                <li key={s.key} className="flex items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{s.merchant}</p>
                    <p className="text-xs text-muted">{s.type === 'suscripcion' ? 'Suscripción' : 'Cargo recurrente'} · último cargo {formatDate(s.lastDate)} · próxima renovación estimada {formatDate(s.nextRenewal)}</p>
                  </div>
                  <p className="num font-bold text-ink">{formatMXN(s.monthly)}/mes</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}

export function AlertsPanel({ alerts, limit, title = 'Alertas' }: { alerts: FinAlert[]; limit?: number; title?: string }) {
  const list = limit ? alerts.slice(0, limit) : alerts;
  return (
    <Panel title={<span className="flex items-center gap-2"><BellRing className="size-5" aria-hidden /> {title}{alerts.length ? ` (${alerts.length})` : ''}</span>} action={limit && alerts.length > limit ? <Link to="/salud" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand">Ver todas</Link> : undefined}>
      {!list.length ? (
        <EmptyState icon={<HeartPulse />} title="Sin alertas" text="Todo en orden por ahora. Las alertas solo avisan: nunca mueven dinero ni confirman gastos." />
      ) : (
        <ul className="space-y-3" data-testid="alertas">
          {list.map((a) => (
            <li key={a.id} className={cx('rounded-control border-l-4 p-3', a.level === 'alta' ? 'border-danger bg-danger-soft' : a.level === 'media' ? 'border-warn bg-warn-soft' : 'border-brand bg-brand-soft')} data-kind={a.kind}>
              <p className="text-sm font-semibold text-ink">{a.title}</p>
              <p className="mt-1 text-xs text-ink-2">{a.action} <Link to={a.link} className="font-semibold text-brand underline">Ir</Link></p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Progress({ value, danger }: { value: number; danger?: boolean }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className={cx('h-full rounded-full', danger ? 'bg-danger' : 'bg-brand')} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

function Bucket({ label, real, target, amount, targetAmount, over }: { label: string; real: number | null; target: number; amount: number; targetAmount: number; over?: boolean }) {
  const bad = real !== null && (over ? real > target : real < target);
  return (
    <div data-testid={`bucket-${label}`}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="font-semibold text-ink">{label}</p>
        <p className={cx('num font-semibold', bad ? 'text-danger' : 'text-ink-2')}>
          {real ?? 0} % <span className="text-muted">· meta {target} %</span>
        </p>
      </div>
      <Progress value={target > 0 && real !== null ? Math.max(0, real) / 100 : 0} danger={bad} />
      <p className="num mt-1 text-xs text-muted">{formatMXN(amount)} de {formatMXN(targetAmount)}</p>
    </div>
  );
}
