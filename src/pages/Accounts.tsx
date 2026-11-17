import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCol, useData, humanError } from '../data/DataContext';
import { useHealth } from '../data/useHealth';
import { ACCOUNT_KINDS, onlyLast4, unassignedExpenses } from '../lib/accounts';
import { CATEGORIES } from '../lib/catalog';
import { formatDate, todayISO } from '../lib/dates';
import { centsToInput, formatMXN, parseToCents } from '../lib/money';
import type { Account, AccountKind } from '../lib/types';
import { useSheet } from '../components/SheetHost';
import { Button, EmptyState, ErrorState, ListSkeleton, MoneyInput, PageHeader, Panel, SelectInput, TextInput, cx, useToast } from '../components/ui';

export function AccountsPage() {
  const { store, retry } = useData();
  const accounts = useCol('accounts');
  const expenses = useCol('expenses').items;
  const transfers = useCol('transfers').items;
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
        subtitle="El saldo se calcula solo con tus movimientos confirmados."
        action={<div className="flex gap-2"><Button variant="secondary" onClick={openTransfer} disabled={!accounts.items.length}><ArrowRightLeft className="size-4" aria-hidden /> Mover dinero</Button><Button onClick={() => openForm()}><Plus className="size-4" aria-hidden /> Cuenta</Button></div>}
      />

      <Panel>
        {accounts.loading ? (
          <ListSkeleton />
        ) : !accounts.items.length ? (
          <EmptyState icon={<Landmark />} title="Sin cuentas" text="Registra tus cuentas (banco, efectivo, Mercado Pago…) con su saldo inicial. Solo últimos 4 dígitos." action={<Button onClick={() => openForm()}>Agregar cuenta</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {accounts.items.map((a) => {
              const b = balances.get(a.id);
              const low = a.lowBalanceThreshold && (b?.balance ?? 0) < a.lowBalanceThreshold;
              return (
                <li key={a.id} className="flex items-center gap-3 py-3" data-testid="cuenta">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Landmark className="size-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{a.name}{a.last4 ? ` ••${a.last4}` : ''}{habits.emergencyAccountId === a.id ? ' · Fondo de emergencia' : ''}</p>
                    <p className="truncate text-xs text-muted">
                      {ACCOUNT_KINDS[a.kind]} · inicial {formatMXN(a.initialBalance)} el {formatDate(a.initialDate)}
                      {b ? ` · −${formatMXN(b.spent + b.transfersOut)} / +${formatMXN(b.received + b.transfersIn)}` : ''}
                    </p>
                  </div>
                  <p className={cx('num shrink-0 text-right text-lg font-extrabold', low ? 'text-danger' : 'text-ink')} data-testid="saldo">{formatMXN(b?.balance ?? a.initialBalance)}</p>
                  <Button variant="ghost" aria-label={`Editar ${a.name}`} onClick={() => openForm(a)}><Pencil className="size-4" aria-hidden /></Button>
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

function AccountForm({ initial, onDone }: { initial?: Account; onDone: () => void }) {
  const { store } = useData();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? 'banco');
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [initialBalance, setInitialBalance] = useState(initial ? centsToInput(initial.initialBalance) : '');
  const [initialDate, setInitialDate] = useState(initial?.initialDate ?? todayISO());
  const [low, setLow] = useState(initial?.lowBalanceThreshold ? centsToInput(initial.lowBalanceThreshold) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const bal = parseToCents(initialBalance || '0');
    const lowC = low.trim() ? parseToCents(low) : null;
    if (!name.trim()) return setError('Escribe un nombre.');
    if (bal === null) return setError('Saldo inicial inválido.');
    setError(null);
    setSaving(true);
    try {
      const data = {
        name: name.trim(), kind, initialBalance: bal, initialDate,
        last4: onlyLast4(last4) || undefined,
        lowBalanceThreshold: lowC && lowC > 0 ? lowC : undefined,
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
      <div className="grid grid-cols-2 gap-3">
        <MoneyInput label="Saldo inicial" value={initialBalance} onChange={setInitialBalance} hint="En tarjeta de crédito, la deuda va en negativo." />
        <TextInput label="Fecha del saldo" type="date" value={initialDate} onChange={(e) => setInitialDate(e.target.value || todayISO())} hint="Cuentan los movimientos desde esta fecha" />
      </div>
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
