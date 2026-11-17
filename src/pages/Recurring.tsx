import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Repeat, Wallet } from 'lucide-react';
import { useCol, useData, useHabits, humanError } from '../data/DataContext';
import { confirmItem } from '../data/ingestActions';
import { formatDate, formatPeriod, todayISO } from '../lib/dates';
import { centsToInput, formatMXN, parseToCents } from '../lib/money';
import {
  CHARGE_LABELS, FREQUENCY_LABELS, PAYDAY_LABELS, chargeInfo, recentPaydays, type ChargeStatus, type Payday, type PaydayStatus,
} from '../lib/recurring';
import { rubroLabel } from '../lib/rubros';
import type { Recurring, RecurringFrequency } from '../lib/types';
import { useSheet } from '../components/SheetHost';
import { Pill, POR_CONFIRMAR, RubroSelect } from '../components/rubroUi';
import { Button, EmptyState, ErrorState, ListSkeleton, MoneyInput, PageHeader, Panel, SelectInput, TextInput, cx, useToast } from '../components/ui';

const PAYDAY_TONE: Record<PaydayStatus, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  esperado: 'muted', sin_detectar: 'warn', detectado: 'info', diferencia: 'danger', recibido: 'ok', recibido_diferencia: 'warn',
};
const CHARGE_TONE: Record<ChargeStatus, 'ok' | 'warn' | 'info'> = { por_confirmar: 'warn', monto_por_confirmar: 'info', confirmado: 'ok' };

const signed = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${formatMXN(Math.abs(c))}`;

export function RecurringPage() {
  const { store, retry } = useData();
  const recurrings = useCol('recurrings');
  const rubros = useCol('rubros').items;
  const accounts = useCol('accounts').items;
  const incomes = useCol('incomes').items;
  const expenses = useCol('expenses').items;
  const inbox = useCol('inbox').items;
  const rules = useCol('merchantRules').items;
  const merchantRubros = useCol('merchantRubros').items;
  const habits = useHabits();
  const open = useSheet();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayISO();

  const ingresos = recurrings.items.filter((r) => r.flow === 'ingreso');
  const cargos = useMemo(() => [...recurrings.items.filter((r) => r.flow === 'cargo')].sort((a, b) => (a.setupKey && b.setupKey ? 0 : a.createdAt - b.createdAt)), [recurrings.items]);
  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name;

  async function confirmDeposit(r: Recurring, p: Payday) {
    const item = inbox.find((i) => i.id === p.inboxId);
    if (!item) return;
    setBusy(item.id);
    try {
      await confirmItem(store, item, { accountId: item.accountId ?? r.accountId ?? null, rubroId: r.rubroId }, {
        accounts, rules: [...rules], habits, merchantRubros: [...merchantRubros], recurrings: recurrings.items,
      });
      toast(p.status === 'diferencia' ? `Depósito confirmado por ${formatMXN(p.amount ?? 0)} (diferencia ${signed(p.diff ?? 0)})` : 'Depósito de nómina confirmado');
    } catch (e) {
      toast(humanError(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function adoptAmount(r: Recurring, amount: number) {
    try {
      await store.update('recurrings', r.id, { expectedAmount: amount, amountConfirmed: true });
      toast(`Monto de ${r.name} confirmado: ${formatMXN(amount)}`);
    } catch (e) {
      toast(humanError(e), 'error');
    }
  }

  const edit = (r: Recurring) => open({ kind: 'custom', title: `Editar ${r.name}`, content: (close) => <RecurringForm initial={r} onDone={close} /> });

  if (recurrings.error) return <ErrorState message={recurrings.error} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Recurrentes" subtitle="Ingreso quincenal y cargos que se repiten. Lo que no está confirmado aparece como «por confirmar»: nada se da por recibido o pagado solo porque llegó la fecha." />

      <Panel title={<span className="flex items-center gap-2"><Wallet className="size-5" aria-hidden /> Ingreso quincenal</span>}>
        {recurrings.loading ? <ListSkeleton /> : !ingresos.length ? (
          <EmptyState icon={<Wallet />} title="Sin ingreso recurrente" text="El alta inicial agrega la Nómina quincenal." />
        ) : ingresos.map((r) => (
          <div key={r.id} className="space-y-4" data-testid="ingreso-recurrente">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-ink">{r.name}</p>
                <p className="text-sm text-muted">
                  {r.expectedAmount !== undefined && r.amountConfirmed ? formatMXN(r.expectedAmount) : POR_CONFIRMAR} · {FREQUENCY_LABELS[r.frequency]}
                  {' · '}{r.days?.length ? `días ${r.days.join(' y ')}${r.daysConfirmed ? '' : ' (aproximados)'}` : 'fechas por confirmar'}
                  {' · '}{accountName(r.accountId) ?? 'cuenta por asignar'}
                </p>
              </div>
              <Button variant="ghost" onClick={() => edit(r)} aria-label={`Editar ${r.name}`}><Pencil className="size-4" aria-hidden /> Editar</Button>
            </div>
            {recentPaydays(r, today, { incomes, inbox }).map(({ period, days }) => (
              <div key={period}>
                <p className="mb-2 text-sm font-semibold capitalize text-ink-2">{formatPeriod(period, true)}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {days.map((p) => (
                    <li key={p.estimatedDate} className="rounded-control border border-line p-3" data-testid="quincena" data-status={p.status}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">Estimado {formatDate(p.estimatedDate)}</p>
                        <Pill tone={PAYDAY_TONE[p.status]}>{PAYDAY_LABELS[p.status]}</Pill>
                      </div>
                      {p.amount !== undefined ? (
                        <p className="mt-1 text-sm text-ink-2">
                          {p.status.startsWith('recibido') ? 'Recibido' : 'Detectado'} el {formatDate(p.date!)}: <span className="num font-bold text-ink">{formatMXN(p.amount)}</span>
                          {p.diff ? <span className="num font-semibold text-danger"> · diferencia {signed(p.diff)}</span> : null}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted">{p.status === 'sin_detectar' ? 'Byte no ha detectado este depósito. No se marca como recibido.' : 'Aún no llega la fecha estimada.'}</p>
                      )}
                      {(p.status === 'detectado' || p.status === 'diferencia') && (
                        <Button className="mt-2" onClick={() => confirmDeposit(r, p)} loading={busy === p.inboxId}>
                          {p.status === 'diferencia' ? `Confirmar ${formatMXN(p.amount ?? 0)} recibido` : 'Confirmar depósito'}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
        <p className="mt-4 text-xs text-muted">Aguinaldo y prima vacacional se siguen calculando en <strong>Ingresos</strong>, como en el MVP.</p>
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><Repeat className="size-5" aria-hidden /> Cargos recurrentes</span>}>
        {recurrings.loading ? <ListSkeleton /> : !cargos.length ? (
          <EmptyState icon={<Repeat />} title="Sin cargos recurrentes" text="El alta inicial agrega tus suscripciones y pagos fijos." />
        ) : (
          <ul className="divide-y divide-line">
            {cargos.map((r) => {
              const info = chargeInfo(r, { expenses, inbox });
              const last = [info.lastConfirmed, info.lastPending].filter(Boolean).sort((a, b) => (a!.date < b!.date ? 1 : -1))[0];
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="cargo-recurrente">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{r.name}</p>
                    <p className="text-xs text-muted">{rubroLabel(rubros, r.rubroId)} · {FREQUENCY_LABELS[r.frequency]} · {r.days?.length ? `día ${r.days.join(', ')}` : 'fecha por confirmar'}{r.accountId ? ` · ${accountName(r.accountId) ?? ''}` : ''}</p>
                    {last && (
                      <p className="mt-1 text-xs text-ink-2">
                        Último {last === info.lastPending ? 'detectado (por confirmar)' : 'registrado'}: <span className="num font-semibold">{formatMXN(last.amount)}</span> el {formatDate(last.date)}
                        {info.diff ? <span className="num font-semibold text-danger"> · diferencia {signed(info.diff)}</span> : null}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={cx('num font-bold', r.amountConfirmed && r.expectedAmount !== undefined ? 'text-ink' : 'text-warn')}>{r.amountConfirmed && r.expectedAmount !== undefined ? formatMXN(r.expectedAmount) : POR_CONFIRMAR}</p>
                    <Pill tone={CHARGE_TONE[info.status]}>{CHARGE_LABELS[info.status]}</Pill>
                  </div>
                  <div className="flex gap-1">
                    {last && info.status !== 'confirmado' && (
                      <Button variant="secondary" onClick={() => adoptAmount(r, last.amount)}>Usar {formatMXN(last.amount)}</Button>
                    )}
                    <Button variant="ghost" onClick={() => edit(r)} aria-label={`Editar ${r.name}`}><Pencil className="size-4" aria-hidden /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">El monto y la fecha reales llegan con lo que Byte detecte en el correo (<Link to="/importar" className="font-semibold text-brand">Importar</Link>) o los capturas tú. Nada se inventa.</p>
      </Panel>
    </div>
  );
}

function RecurringForm({ initial, onDone }: { initial: Recurring; onDone: () => void }) {
  const { store } = useData();
  const rubros = useCol('rubros').items;
  const accounts = useCol('accounts').items;
  const toast = useToast();
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(initial.expectedAmount !== undefined ? centsToInput(initial.expectedAmount) : '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(initial.frequency);
  const [days, setDays] = useState(initial.days?.join(', ') ?? '');
  const [daysConfirmed, setDaysConfirmed] = useState(initial.daysConfirmed ?? false);
  const [accountId, setAccountId] = useState(initial.accountId ?? '');
  const [rubroId, setRubroId] = useState(initial.rubroId);
  const [match, setMatch] = useState(initial.match.join(', '));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cents = amount.trim() ? parseToCents(amount) : undefined;
    if (cents === null || (cents !== undefined && cents <= 0)) return setError('Monto inválido (vacío = por confirmar).');
    const ds = days.split(/[,\sy]+/).filter(Boolean).map(Number);
    if (ds.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) return setError('Los días van del 1 al 31, separados por coma.');
    const words = match.split(',').map((w) => w.trim()).filter(Boolean);
    if (!name.trim()) return setError('Escribe un nombre.');
    try {
      await store.update('recurrings', initial.id, {
        name: name.trim(), frequency, rubroId, match: words.length ? words : initial.match,
        expectedAmount: cents, amountConfirmed: cents !== undefined,
        days: ds.length ? ds : undefined, daysConfirmed: ds.length ? daysConfirmed : undefined,
        accountId: accountId || undefined,
      });
      toast('Recurrente actualizado');
      onDone();
    } catch (err) {
      toast(humanError(err), 'error');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} error={error} />
      <div className="grid grid-cols-2 gap-3">
        <MoneyInput label="Monto" value={amount} onChange={setAmount} hint="Vacío = por confirmar" />
        <SelectInput label="Frecuencia" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
          {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectInput>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Días del mes" value={days} onChange={(e) => setDays(e.target.value)} placeholder="Por confirmar" hint="Ej. 13, 28" />
        <SelectInput label="Cuenta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Por asignar</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </SelectInput>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-2">
        <input type="checkbox" className="size-5 accent-[var(--color-brand)]" checked={daysConfirmed} onChange={(e) => setDaysConfirmed(e.target.checked)} />
        Las fechas son exactas (no aproximadas)
      </label>
      <div>
        <label className="mb-1 block text-sm font-semibold text-ink-2" htmlFor="rec-rubro">Rubro</label>
        <RubroSelect id="rec-rubro" rubros={rubros} flow={initial.flow === 'ingreso' ? 'ingreso' : 'gasto'} value={rubroId} onChange={setRubroId} />
      </div>
      <TextInput label="Palabras para reconocerlo en el correo" value={match} onChange={(e) => setMatch(e.target.value)} hint="Separadas por coma. Se buscan como palabras completas en el comercio o concepto." />
      <Button type="submit" className="w-full">Guardar</Button>
    </form>
  );
}
