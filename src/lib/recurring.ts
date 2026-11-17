/**
 * Ingresos y cargos recurrentes (Mensaje 4).
 *
 * Regla de oro: una fecha estimada NUNCA marca un depósito como recibido. Solo cuenta lo que Byte
 * detectó en el correo y, como «recibido», lo que Diego confirmó.
 */
import type { Cents } from './money';
import { addMonths, dateInMonth, daysBetween, periodOf, type ISODate, type Period } from './dates';
import type { Expense, InboxItem, Income, Recurring, RecurringFrequency } from './types';
import { fold } from './rubros';

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  anual: 'Anual',
  mensual_o_anual: 'Mensual o anual (por confirmar)',
  variable: 'Variable',
  por_confirmar: 'Por confirmar',
};

/** Ventana (días) alrededor de la fecha estimada para aceptar un depósito como de esa quincena. */
export const PAYDAY_WINDOW_DAYS = 5;

type Detectable = Pick<InboxItem, 'merchant' | 'description' | 'direction'>;

/** ¿Este movimiento corresponde a este recurrente? Por palabras completas en comercio o concepto. */
export function recurringMatches(item: Detectable, r: Pick<Recurring, 'flow' | 'match'>): boolean {
  const wantDir = r.flow === 'ingreso' ? 'entrada' : 'salida';
  if (item.direction !== wantDir) return false;
  const text = ` ${fold(`${item.merchant} ${item.description ?? ''}`).replace(/[^a-z0-9]+/g, ' ')} `;
  return r.match.some((m) => {
    const k = fold(m).replace(/[^a-z0-9]+/g, ' ').trim();
    return k.length > 1 && text.includes(` ${k} `);
  });
}

/** El recurrente que mejor coincide (la palabra más larga gana: «uber eats» antes que «uber»). */
export function matchRecurring<T extends Detectable>(item: T, recurrings: readonly Recurring[]): Recurring | undefined {
  const score = (r: Recurring) => Math.max(0, ...r.match.map((m) => (recurringMatches(item, { flow: r.flow, match: [m] }) ? m.length : 0)));
  return [...recurrings]
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)[0]?.r;
}

// ---------- Ingreso quincenal: estimado vs real ----------

export type PaydayStatus =
  /** La fecha estimada aún no llega y no se ha detectado nada. */
  | 'esperado'
  /** Ya pasó la fecha estimada y Byte no ha detectado el depósito: NO se marca como recibido. */
  | 'sin_detectar'
  /** Byte lo detectó por el monto esperado; falta que Diego lo confirme. */
  | 'detectado'
  /** Byte lo detectó por otro monto: diferencia por confirmar. */
  | 'diferencia'
  /** Diego lo confirmó y coincide con el monto esperado. */
  | 'recibido'
  /** Diego lo confirmó por un monto distinto al esperado. */
  | 'recibido_diferencia';

export interface Payday {
  estimatedDate: ISODate;
  status: PaydayStatus;
  /** Monto detectado o confirmado. */
  amount?: Cents;
  /** amount − esperado (solo si hay monto). */
  diff?: Cents;
  date?: ISODate;
  inboxId?: string;
  incomeId?: string;
}

/** Fechas estimadas de un periodo "YYYY-MM" (13 y 28 → dos fechas; en febrero 28 sigue siendo 28). */
export function estimatedDates(r: Pick<Recurring, 'days'>, period: Period): ISODate[] {
  const [y = 1970, m = 1] = period.split('-').map(Number);
  return [...new Set((r.days ?? []).map((d) => dateInMonth(y, m, d)))].sort();
}

/**
 * Estado de cada quincena del periodo, comparando la fecha estimada con lo detectado (inbox) y lo confirmado (ingresos).
 * Cada depósito se asigna a una sola quincena (la más cercana dentro de ±PAYDAY_WINDOW_DAYS).
 */
export function paydays(
  r: Recurring,
  period: Period,
  today: ISODate,
  data: { incomes: readonly Income[]; inbox: readonly InboxItem[] },
): Payday[] {
  const dates = estimatedDates(r, period);
  const expected = r.amountConfirmed ? r.expectedAmount : undefined;

  type Cand = { date: ISODate; amount: Cents; confirmed: boolean; inboxId?: string; incomeId?: string };
  const cands: Cand[] = [
    ...data.incomes.filter((i) => i.recurringId === r.id).map((i) => ({ date: i.date, amount: i.amount, confirmed: true, incomeId: i.id, inboxId: i.importItemId })),
    ...data.inbox
      .filter((i) => i.status === 'pendiente' && i.direction === 'entrada' && i.recurringId === r.id)
      .map((i) => ({ date: i.date, amount: i.amount, confirmed: false, inboxId: i.id })),
  ];

  // Asignación voraz por cercanía: pares (fecha estimada, candidato) ordenados por distancia.
  const pairs: { di: number; ci: number; dist: number }[] = [];
  dates.forEach((d, di) => cands.forEach((c, ci) => {
    const dist = Math.abs(daysBetween(d, c.date));
    if (dist <= PAYDAY_WINDOW_DAYS) pairs.push({ di, ci, dist });
  }));
  // Confirmados primero a igual distancia.
  pairs.sort((a, b) => a.dist - b.dist || Number(cands[b.ci]!.confirmed) - Number(cands[a.ci]!.confirmed));
  const byDate = new Map<number, Cand>();
  const used = new Set<number>();
  for (const p of pairs) {
    if (byDate.has(p.di) || used.has(p.ci)) continue;
    byDate.set(p.di, cands[p.ci]!);
    used.add(p.ci);
  }

  return dates.map((d, di) => {
    const c = byDate.get(di);
    if (!c) return { estimatedDate: d, status: d > today ? 'esperado' : 'sin_detectar' };
    const diff = expected === undefined ? undefined : c.amount - expected;
    const same = diff === undefined || diff === 0;
    const status: PaydayStatus = c.confirmed ? (same ? 'recibido' : 'recibido_diferencia') : same ? 'detectado' : 'diferencia';
    return {
      estimatedDate: d, status, amount: c.amount, date: c.date,
      ...(diff !== undefined ? { diff } : {}),
      ...(c.inboxId ? { inboxId: c.inboxId } : {}),
      ...(c.incomeId ? { incomeId: c.incomeId } : {}),
    };
  });
}

/** Quincenas del mes actual y del anterior (para la pantalla Recurrentes). */
export function recentPaydays(r: Recurring, today: ISODate, data: { incomes: readonly Income[]; inbox: readonly InboxItem[] }): { period: Period; days: Payday[] }[] {
  const cur = periodOf(today);
  return [addMonths(cur, -1), cur].map((period) => ({ period, days: paydays(r, period, today, data) }));
}

export const PAYDAY_LABELS: Record<PaydayStatus, string> = {
  esperado: 'Esperado',
  sin_detectar: 'No detectado aún',
  detectado: 'Detectado · por confirmar',
  diferencia: 'Diferencia por confirmar',
  recibido: 'Recibido',
  recibido_diferencia: 'Recibido con diferencia',
};

// ---------- Cargos recurrentes ----------

export type ChargeStatus =
  /** No hay monto confirmado ni cargo detectado. */
  | 'por_confirmar'
  /** Hay cargo detectado o registrado, pero Diego no ha confirmado el monto recurrente. */
  | 'monto_por_confirmar'
  /** Monto confirmado por Diego. */
  | 'confirmado';

export interface ChargeInfo {
  status: ChargeStatus;
  /** Último cargo confirmado (gasto registrado). */
  lastConfirmed?: { date: ISODate; amount: Cents; id: string };
  /** Último cargo detectado por Byte aún pendiente. */
  lastPending?: { date: ISODate; amount: Cents; id: string };
  /** Si hay monto confirmado y el último cargo es distinto: diferencia (último − esperado). */
  diff?: Cents;
}

export function chargeInfo(r: Recurring, data: { expenses: readonly Expense[]; inbox: readonly InboxItem[] }): ChargeInfo {
  const latest = <T extends { date: ISODate }>(xs: T[]) => [...xs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const conf = latest(data.expenses.filter((e) => e.recurringId === r.id));
  const pend = latest(data.inbox.filter((i) => i.status === 'pendiente' && i.direction === 'salida' && i.recurringId === r.id));
  const info: ChargeInfo = { status: r.amountConfirmed && r.expectedAmount !== undefined ? 'confirmado' : conf || pend ? 'monto_por_confirmar' : 'por_confirmar' };
  if (conf) info.lastConfirmed = { date: conf.date, amount: conf.amount, id: conf.id };
  if (pend) info.lastPending = { date: pend.date, amount: pend.amount, id: pend.id };
  const last = [info.lastConfirmed, info.lastPending].filter(Boolean).sort((a, b) => (a!.date < b!.date ? 1 : -1))[0];
  if (info.status === 'confirmado' && last && last.amount !== r.expectedAmount) info.diff = last.amount - r.expectedAmount!;
  return info;
}

export const CHARGE_LABELS: Record<ChargeStatus, string> = {
  por_confirmar: 'Sin cargo detectado',
  monto_por_confirmar: 'Monto por confirmar',
  confirmado: 'Confirmado',
};
