import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, ChevronRight, CreditCard, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCol, useData, humanError } from '../data/DataContext';
import { useHealth } from '../data/useHealth';
import { ACCOUNT_KINDS, accountSummary, isCard, onlyLast4, unassignedExpenses } from '../lib/accounts';
import { POR_CONFIRMAR } from '../components/rubroUi';
import { CATEGORIES } from '../lib/catalog';
import { formatDate, todayISO } from '../lib/dates';
import { centsToInput, formatMXN, parseToCents } from '../lib/money';
import type { Account, AccountKind } from '../lib/types';
import { SETUP_ACCOUNTS, SETUP_CASH } from '../lib/setup';

const SETUP_ORDER = [...SETUP_ACCOUNTS.map((a) => a.id), SETUP_CASH.id];
import { useSheet } from '../components/SheetHost';
import { Button, EmptyState, ErrorState, ListSkeleton, MoneyInput, PageHeader, Panel, SelectInput, TextInput, cx, useToast } from '../components/ui';

export function AccountsPage() {
  const { store, retry } = useData();
  const accounts = useCol('accounts');
  const expenses = useCol('expenses').items;
  const transfers = useCol('transfers').items;
  const incomes = useCol('incomes').items;
  const inbox = useCol('inbox').items;
  const { balances, habits } = useHealth();
  const open = useSheet();
  const toast = useToast();
  const unassigned = unassignedExpenses(expenses).sort((a, b) => (a.date < b.date ? 1 : -1));

  const openForm = (initial?: Account) => open({ kind: 'custom', title: initial ? 'Editar cuenta' : 'Nueva cuenta', content: (close) => <AccountForm initial={initial} onDone={close} /> });
  const openTransfer = () => open({ kind: 'custom', title: 'Movimiento entre cuentas', content: (close) => <TransferForm onDone={close} /> });

  if (accounts.error) return <ErrorState message={accounts.error} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas"
        subtitle="El saldo se calcula solo con tus movimientos confirmados. Lo que falte aparece como «por confirmar»."
        action={<div className="flex gap-2"><Button variant="secondary" onClick={openTransfer} disabled={!accounts.items.length}><ArrowRightLeft className="size-4" aria-hidden /> Mover dinero</Button><Button onClick={() => openForm()}><Plus className="size-4" aria-hidden /> Cuenta</Button></div>}
      />

      <Panel>
        {accounts.loading ? (
          <ListSkeleton />
        ) : !accounts.items.length ? (
          <EmptyState icon={<Landmark />} title="Sin cuentas" text="Registra tus cuentas (banco, efectivo, Mercado Pago…) con su saldo inicial. Solo últimos 4 dígitos." action={<Button onClick={() => openForm()}>Agregar cuenta</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {[...accounts.items].sort(accountOrder).map((a) => {
              const b = balances.get(a.id);
              const sum = accountSummary(a, expenses, incomes, transfers, inbox);
              const low = !a.balancePending && a.lowBalanceThreshold && (b?.balance ?? 0) < a.lowBalanceThreshold;
              const card = isCard(a.kind);
              const missing = [a.balancePending && 'saldo', !a.last4 && a.kind !== 'efectivo' && 'últimos 4', card && (!a.cutDay || !a.dueDay) && 'corte y pago'].filter(Boolean);
              return (
                <li key={a.id} className="flex items-center gap-3 py-3" data-testid="cuenta">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">{card ? <CreditCard className="size-5" aria-hidden /> : <Landmark className="size-5" aria-hidden />}</span>
                  <Link to={`/cuentas/${a.id}`} className="min-w-0 flex-1 rounded-control hover:bg-surface-2">
                    <p className="truncate font-semibold text-ink">{a.name}{a.last4 ? ` ••${a.last4}` : ''}{habits.emergencyAccountId === a.id ? ' · Fondo de emergencia' : ''}</p>
                    <p className="truncate text-xs text-muted">
                      {ACCOUNT_KINDS[a.kind]}{a.institution ? ` · ${a.institution}` : ''}
                      {a.balancePending ? '' : ` · inicial ${formatMXN(a.initialBalance)} el ${formatDate(a.initialDate)}`}
                      {` · −${formatMXN(sum.spent + sum.transfersOut)} / +${formatMXN(sum.received + sum.transfersIn)}`}
                      {sum.pendingCount ? ` · ${sum.pendingCount} pendiente${sum.pendingCount === 1 ? '' : 's'}` : ''}
                    </p>
                    {missing.length > 0 && <p className="mt-1 text-xs font-semibold text-warn">Por confirmar: {missing.join(', ')}</p>}
                  </Link>
                  {a.balancePending ? (
                    <p className="hidden shrink-0 text-right text-sm font-bold text-warn sm:block" data-testid="saldo">Saldo {POR_CONFIRMAR.toLowerCase()}</p>
                  ) : (
                    <p className={cx('num shrink-0 text-right text-lg font-extrabold', low ? 'text-danger' : 'text-ink')} data-testid="saldo">{formatMXN(b?.balance ?? a.initialBalance)}</p>
                  )}
                  <Button variant="ghost" aria-label={`Editar ${a.name}`} onClick={() => openForm(a)}><Pencil className="size-4" aria-hidden /></Button>
                  <ChevronRight className="hidden size-4 text-muted sm:block" aria-hidden />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title={`Por asignar${unassigned.length ? ` (${unassigned.length})` : ''}`}>
        {!unassigned.length ? (
          <p className="text-sm text-muted">Todos los gastos importados tienen cuenta.</p>
        ) : (
          <ul className="divide-y divide-line">
            {unassigned.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{e.concept}</p>
                  <p className="text-xs text-muted">{CATEGORIES[e.category].label} · {formatDate(e.date)} · {formatMXN(e.amount)}</p>
                </div>
                <select
                  aria-label={`Cuenta para ${e.concept}`}
                  className="min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
                  defaultValue=""
                  onChange={async (ev) => {
                    if (!ev.target.value) return;
                    try {
                      await store.update('expenses', e.id, { accountId: ev.target.value });
                      toast('Cuenta asignada');
                    } catch (err) {
                      toast(humanError(err), 'error');
                    }
                  }}
                >
                  <option value="">Elegir cuenta…</option>
                  {accounts.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {transfers.length > 0 && (
        <Panel title="Movimientos entre cuentas">
          <ul className="divide-y divide-line">
            {[...transfers].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{t.concept}</p>
                  <p className="text-xs text-muted">
                    {formatDate(t.date)} · {accounts.items.find((a) => a.id === t.fromAccountId)?.name ?? 'Fuera de la app'} → {accounts.items.find((a) => a.id === t.toAccountId)?.name ?? '—'}
                  </p>
                </div>
                <p className="num font-bold text-ink">{formatMXN(t.amount)}</p>
                <Button variant="ghost" aria-label={`Eliminar ${t.concept}`} onClick={() => window.confirm('¿Eliminar este movimiento?') && void store.remove('transfers', t.id)}><Trash2 className="size-4" aria-hidden /></Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="text-xs text-muted">¿Gastos detectados en el correo? Revísalos en <Link to="/importar" className="font-semibold text-brand">Importar</Link>.</p>
    </div>
  );
}

/** Orden: alta inicial primero (en el orden de Diego), luego las demás por fecha de creación. */
function accountOrder(a: Account, b: Account): number {
  const ia = a.setupKey ? SETUP_ORDER.indexOf(a.setupKey) : -1;
  const ib = b.setupKey ? SETUP_ORDER.indexOf(b.setupKey) : -1;
  if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  return a.createdAt - b.createdAt;
}

export function AccountForm({ initial, onDone }: { initial?: Account; onDone: () => void }) {
  const { store } = useData();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? 'banco');
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [initialBalance, setInitialBalance] = useState(initial ? centsToInput(initial.initialBalance) : '');
  const [initialDate, setInitialDate] = useState(initial?.initialDate ?? todayISO());
  const [low, setLow] = useState(initial?.lowBalanceThreshold ? centsToInput(initial.lowBalanceThreshold) : '');
  const [institution, setInstitution] = useState(initial?.institution ?? '');
  const [pendingBal, setPendingBal] = useState(initial?.balancePending ?? false);
  const [cutDay, setCutDay] = useState(initial?.cutDay ? String(initial.cutDay) : '');
  const [dueDay, setDueDay] = useState(initial?.dueDay ? String(initial.dueDay) : '');
  const [limit, setLimit] = useState(initial?.creditLimit ? centsToInput(initial.creditLimit) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const bal = pendingBal ? 0 : parseToCents(initialBalance);
    const lowC = low.trim() ? parseToCents(low) : null;
    const day = (v: string) => (v.trim() ? Number(v) : undefined);
    const cd = day(cutDay);
    const dd = day(dueDay);
    const lim = limit.trim() ? parseToCents(limit) : undefined;
    if (!name.trim()) return setError('Escribe un nombre.');
    if (bal === null) return setError(initialBalance.trim() ? 'Saldo inicial inválido.' : 'Escribe el saldo inicial o marca «Saldo por confirmar».');
    if ([cd, dd].some((d) => d !== undefined && !(Number.isInteger(d) && d >= 1 && d <= 31))) return setError('El día de corte y el de pago van del 1 al 31.');
    if (lim === null) return setError('Límite de crédito inválido.');
    setError(null);
    setSaving(true);
    try {
      const card = isCard(kind);
      const data = {
        name: name.trim(), kind, initialBalance: bal, initialDate,
        last4: onlyLast4(last4) || undefined,
        lowBalanceThreshold: lowC && lowC > 0 ? lowC : undefined,
        institution: institution.trim() || undefined,
        balancePending: pendingBal || undefined,
        cutDay: card ? cd : undefined,
        dueDay: card ? dd : undefined,
        creditLimit: kind === 'tarjeta_credito' && lim ? lim : undefined,
      };
      if (initial) await store.update('accounts', initial.id, data);
      else await store.add('accounts', data);
      toast(initial ? 'Cuenta actualizada' : 'Cuenta registrada');
      onDone();
    } catch (err) {
      toast(humanError(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Nómina, Efectivo, Mercado Pago" maxLength={40} error={error} />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          {Object.entries(ACCOUNT_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectInput>
        <TextInput label="Últimos 4 dígitos" inputMode="numeric" value={last4} onChange={(e) => setLast4(onlyLast4(e.target.value))} placeholder="1234" hint="Nunca el número completo" />
      </div>
      <TextInput label="Institución (opcional)" value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={40} placeholder="Ej. Banamex, BBVA, American Express" />
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-2">
        <input type="checkbox" className="size-5 accent-[var(--color-brand)]" checked={pendingBal} onChange={(e) => setPendingBal(e.target.checked)} />
        Saldo por confirmar (aún no lo sé)
      </label>
      <div className="grid grid-cols-2 gap-3">
        {!pendingBal && <MoneyInput label="Saldo inicial" value={initialBalance} onChange={setInitialBalance} hint={kind === 'hipotecario' ? 'Saldo deudor: va en negativo.' : 'En tarjeta de crédito, la deuda va en negativo.'} />}
        <TextInput label="Fecha del saldo" type="date" value={initialDate} onChange={(e) => setInitialDate(e.target.value || todayISO())} hint="Cuentan los movimientos desde esta fecha" />
      </div>
      {isCard(kind) && (
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Día de corte" inputMode="numeric" value={cutDay} onChange={(e) => setCutDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Por confirmar" />
          <TextInput label="Día límite de pago" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Por confirmar" />
        </div>
      )}
      {kind === 'tarjeta_credito' && <MoneyInput label="Límite de crédito (opcional)" value={limit} onChange={setLimit} hint="Vacío = por confirmar" />}
      <MoneyInput label="Avisarme si el saldo baja de (opcional)" value={low} onChange={setLow} />
      <Button type="submit" className="w-full" loading={saving}>Guardar cuenta</Button>
      {initial && (
        <Button type="button" variant="ghost" className="w-full text-danger" onClick={async () => {
          if (!window.confirm('¿Eliminar esta cuenta? Los movimientos se conservan, sin cuenta.')) return;
          await store.remove('accounts', initial.id);
          onDone();
        }}>
          <Trash2 className="size-4" aria-hidden /> Eliminar cuenta
        </Button>
      )}
    </form>
  );
}

function TransferForm({ onDone }: { onDone: () => void }) {
  const { store } = useData();
  const accounts = useCol('accounts').items;
  const { habits } = useHealth();
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(habits.emergencyAccountId ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [concept, setConcept] = useState(habits.emergencyAccountId && to === habits.emergencyAccountId ? 'Aporte a fondo de emergencia' : '');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = parseToCents(amount);
    if (c === null || c <= 0) return setError('Escribe un monto mayor a cero.');
    if (!to || to === from) return setError('Elige una cuenta destino distinta del origen.');
    try {
      await store.add('transfers', { date, amount: c, toAccountId: to, fromAccountId: from || undefined, concept: concept.trim() || 'Movimiento entre cuentas' });
      toast('Movimiento registrado');
      onDone();
    } catch (err) {
      toast(humanError(err), 'error');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <MoneyInput label="Monto" value={amount} onChange={setAmount} error={error} big autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput label="De" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Fuera de la app</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </SelectInput>
        <SelectInput label="A" value={to} onChange={(e) => setTo(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </SelectInput>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} maxLength={80} placeholder="Ej. aporte al fondo" />
        <TextInput label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
      </div>
      <p className="text-xs text-muted">No es gasto ni ingreso: solo cambia el saldo de cada cuenta.</p>
      <Button type="submit" className="w-full">Registrar</Button>
    </form>
  );
}
