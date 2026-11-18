import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Inbox, Pencil } from 'lucide-react';
import { useCol, useData } from '../data/DataContext';
import { ACCOUNT_KINDS, accountSummary, isCard, isDebt } from '../lib/accounts';
import { CATEGORIES } from '../lib/catalog';
import { formatDate } from '../lib/dates';
import { formatMXN } from '../lib/money';
import { INGEST_TYPE_LABELS } from '../lib/ingest';
import { rubroLabel } from '../lib/rubros';
import { useSheet } from '../components/SheetHost';
import { Pill, POR_CONFIRMAR } from '../components/rubroUi';
import { Button, EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, cx } from '../components/ui';
import { AccountForm } from './Accounts';

interface Row {
  id: string;
  date: string;
  concept: string;
  detail: string;
  /** + entra, − sale */
  amount: number;
}

export function AccountDetailPage() {
  const { id = '' } = useParams();
  const { retry } = useData();
  const accounts = useCol('accounts');
  const expenses = useCol('expenses').items;
  const incomes = useCol('incomes').items;
  const transfers = useCol('transfers').items;
  const inbox = useCol('inbox').items;
  const rubros = useCol('rubros').items;
  const open = useSheet();
  const account = accounts.items.find((a) => a.id === id);

  const rows = useMemo<Row[]>(() => {
    if (!account) return [];
    const out: Row[] = [];
    for (const e of expenses) if (e.accountId === id) out.push({ id: `e-${e.id}`, date: e.date, concept: e.concept, detail: e.rubroId ? rubroLabel(rubros, e.rubroId) : CATEGORIES[e.category].label, amount: -e.amount });
    for (const i of incomes) if (i.accountId === id) out.push({ id: `i-${i.id}`, date: i.date, concept: i.concept, detail: i.rubroId ? rubroLabel(rubros, i.rubroId) : 'Ingreso', amount: i.amount });
    for (const t of transfers) {
      if (t.toAccountId === id) out.push({ id: `t-${t.id}-in`, date: t.date, concept: t.concept, detail: 'Movimiento entre cuentas', amount: t.amount });
      if (t.fromAccountId === id) out.push({ id: `t-${t.id}-out`, date: t.date, concept: t.concept, detail: 'Movimiento entre cuentas', amount: -t.amount });
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [account, expenses, incomes, transfers, rubros, id]);

  const pending = useMemo(() => inbox.filter((i) => i.status === 'pendiente' && i.accountId === id).sort((a, b) => (a.date < b.date ? 1 : -1)), [inbox, id]);

  if (accounts.error) return <ErrorState message={accounts.error} onRetry={retry} />;
  if (accounts.loading) return <ListSkeleton />;
  if (!account) {
    return <EmptyState icon={<Inbox />} title="Cuenta no encontrada" text="Puede que se haya eliminado." action={<Link to="/cuentas" className="font-semibold text-brand">Volver a Cuentas</Link>} />;
  }

  const sum = accountSummary(account, expenses, incomes, transfers, inbox);
  const card = isCard(account.kind);
  const debt = isDebt(account.kind);
  const day = (d?: number) => (d ? `Día ${d} de cada mes` : POR_CONFIRMAR);

  return (
    <div className="space-y-6">
      <Link to="/cuentas" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"><ArrowLeft className="size-4" aria-hidden /> Cuentas</Link>
      <PageHeader
        title={account.name}
        subtitle={[ACCOUNT_KINDS[account.kind], account.institution, account.note].filter(Boolean).join(' · ')}
        action={<Button variant="secondary" onClick={() => open({ kind: 'custom', title: 'Editar cuenta', content: (close) => <AccountForm initial={account} onDone={close} /> })}><Pencil className="size-4" aria-hidden /> Editar</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel>
          <p className="text-sm font-semibold text-ink-2">{debt ? 'Saldo deudor (confirmado)' : 'Saldo (confirmado)'}</p>
          {sum.confirmed === null ? (
            <>
              <p className="mt-1 text-2xl font-extrabold text-warn" data-testid="saldo-detalle">{POR_CONFIRMAR}</p>
              <p className="mt-1 text-xs text-muted">Falta el saldo inicial. Neto de movimientos confirmados: <span className="num font-semibold">{sum.netConfirmed >= 0 ? '+' : '−'}{formatMXN(Math.abs(sum.netConfirmed))}</span></p>
            </>
          ) : (
            <>
              <p className="num mt-1 text-2xl font-extrabold text-ink" data-testid="saldo-detalle">{formatMXN(sum.confirmed)}</p>
              <p className="mt-1 text-xs text-muted">Inicial {formatMXN(account.initialBalance)} el {formatDate(account.initialDate)}</p>
            </>
          )}
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-ink-2">Pendiente de confirmar</p>
          <p className="num mt-1 text-2xl font-extrabold text-ink" data-testid="pendiente-detalle">
            {sum.pendingCount ? `${sum.pendingIn - sum.pendingOut >= 0 ? '+' : '−'}${formatMXN(Math.abs(sum.pendingIn - sum.pendingOut))}` : formatMXN(0)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {sum.pendingCount} movimiento{sum.pendingCount === 1 ? '' : 's'} detectado{sum.pendingCount === 1 ? '' : 's'}. No cambia el saldo hasta que confirmes.
            {sum.projected !== null && sum.pendingCount > 0 ? ` Si confirmas todo: ${formatMXN(sum.projected)}.` : ''}
          </p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-ink-2">Datos</p>
          <dl className="mt-1 space-y-1 text-sm">
            <Item label="Últimos 4 dígitos" value={account.last4 ? `••${account.last4}` : account.kind === 'efectivo' ? 'No aplica' : POR_CONFIRMAR} />
            {card && <Item label="Fecha de corte" value={day(account.cutDay)} />}
            {card && <Item label="Fecha límite de pago" value={day(account.dueDay)} />}
            {account.kind === 'tarjeta_credito' && <Item label="Límite de crédito" value={account.creditLimit ? formatMXN(account.creditLimit) : POR_CONFIRMAR} />}
          </dl>
        </Panel>
      </div>

      <Panel title={`Pendientes${pending.length ? ` (${pending.length})` : ''}`} action={pending.length > 0 && <Link to="/importar" className="flex min-h-11 items-center text-sm font-semibold text-brand">Confirmar en Importar</Link>}>
        {!pending.length ? (
          <p className="text-sm text-muted">Nada pendiente en esta cuenta.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3 text-sm" data-testid="pendiente-cuenta">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{p.merchant}</p>
                  <p className="text-xs text-muted">{INGEST_TYPE_LABELS[p.type]} · {formatDate(p.date)} · {rubroLabel(rubros, p.rubroId)}</p>
                </div>
                <Pill>Por confirmar</Pill>
                <p className={cx('num font-bold', p.direction === 'entrada' ? 'text-ingreso' : 'text-ink')}>{p.direction === 'entrada' ? '+' : '−'}{formatMXN(p.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Movimientos confirmados">
        {!rows.length ? (
          <p className="text-sm text-muted">Aún no hay movimientos confirmados en esta cuenta.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.slice(0, 100).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3 text-sm" data-testid="movimiento-cuenta">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{r.concept}</p>
                  <p className="text-xs text-muted">{formatDate(r.date)} · {r.detail}</p>
                </div>
                <p className={cx('num font-bold', r.amount > 0 ? 'text-ingreso' : 'text-ink')}>{r.amount > 0 ? '+' : '−'}{formatMXN(Math.abs(r.amount))}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cx('text-right font-semibold', value === POR_CONFIRMAR ? 'text-warn' : 'text-ink')}>{value}</dd>
    </div>
  );
}
