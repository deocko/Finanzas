import type { Cents } from './money';
import { sumCents } from './money';
import type { ISODate, Period } from './dates';
import { addMonths, dateInMonth, daysBetween, parseISODate, periodOf, toISODate } from './dates';
import type { Bill, Card, CryptoHolding, Expense, ExpenseCategory, Fund, Income } from './types';

// ---------- Balances ----------

export interface MonthSummary {
  period: Period;
  income: Cents;
  expense: Cents;
  balance: Cents;
}

export function monthSummary(period: Period, incomes: readonly Income[], expenses: readonly Expense[]): MonthSummary {
  const income = sumCents(incomes.filter((i) => periodOf(i.date) === period).map((i) => i.amount));
  const expense = sumCents(expenses.filter((e) => periodOf(e.date) === period).map((e) => e.amount));
  return { period, income, expense, balance: income - expense };
}

/** Últimos `n` meses terminando en `last`, con balance acumulado. */
export function monthlySeries(
  last: Period,
  n: number,
  incomes: readonly Income[],
  expenses: readonly Expense[],
): (MonthSummary & { cumulative: Cents })[] {
  let cumulative = 0;
  const out: (MonthSummary & { cumulative: Cents })[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const s = monthSummary(addMonths(last, -k), incomes, expenses);
    cumulative += s.balance;
    out.push({ ...s, cumulative });
  }
  return out;
}

export function expensesByCategory(
  expenses: readonly Expense[],
  period?: Period,
): { category: ExpenseCategory; total: Cents }[] {
  const map = new Map<ExpenseCategory, Cents>();
  for (const e of expenses) {
    if (period && periodOf(e.date) !== period) continue;
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

// ---------- Tarjetas ----------

export interface CardTotals {
  /** Suma de saldos deudores de tarjetas de crédito. */
  creditDebt: Cents;
  /** Suma de saldos disponibles en débito. */
  debitAvailable: Cents;
  /** Crédito disponible total (límite − saldo). */
  creditAvailable: Cents;
}

export function cardTotals(cards: readonly Card[]): CardTotals {
  const credit = cards.filter((c) => c.kind === 'credito');
  const debit = cards.filter((c) => c.kind === 'debito');
  return {
    creditDebt: sumCents(credit.map((c) => c.balance)),
    debitAvailable: sumCents(debit.map((c) => c.balance)),
    creditAvailable: sumCents(credit.map((c) => Math.max(0, (c.creditLimit ?? 0) - c.balance))),
  };
}

export function creditUsage(card: Card): number {
  if (!card.creditLimit) return 0;
  return Math.min(1, Math.max(0, card.balance / card.creditLimit));
}

// ---------- Vencimientos ----------

export type Semaforo = 'rojo' | 'amarillo' | 'verde';

export interface DueItem {
  key: string;
  source: 'tarjeta' | 'pago';
  sourceId: string;
  name: string;
  category: ExpenseCategory | 'tarjeta';
  amount: Cents;
  date: ISODate;
  period: Period;
  daysLeft: number;
  semaforo: Semaforo;
}

/** Rojo: vencido o ≤ 3 días. Amarillo: 4–7 días. Verde: > 7 días. */
export function semaforo(daysLeft: number): Semaforo {
  if (daysLeft <= 3) return 'rojo';
  if (daysLeft <= 7) return 'amarillo';
  return 'verde';
}

/**
 * Próximo vencimiento de un pago mensual dado el día del mes.
 * Si el periodo del mes anterior no se pagó y ya venció, se regresa ese (vencido).
 * Se busca desde el mes anterior para no esconder adeudos atrasados.
 */
export function nextMonthlyDue(
  dueDay: number,
  today: ISODate,
  paidPeriods: readonly Period[] = [],
  /** Fecha de alta: no se cobran ocurrencias anteriores a ella. */
  createdOn?: ISODate,
): { date: ISODate; period: Period } {
  let p = addMonths(periodOf(today), -1);
  for (let i = 0; i < 36; i++, p = addMonths(p, 1)) {
    const { y, m } = parseISODate(`${p}-01`);
    const date = dateInMonth(y, m, dueDay);
    if (paidPeriods.includes(p)) continue;
    if (createdOn && date < createdOn) continue;
    return { date, period: p };
  }
  const { y, m } = parseISODate(`${p}-01`);
  return { date: dateInMonth(y, m, dueDay), period: p };
}

function createdOn(createdAt: number): ISODate {
  return toISODate(new Date(createdAt));
}

export function dueItems(cards: readonly Card[], bills: readonly Bill[], today: ISODate): DueItem[] {
  const items: DueItem[] = [];

  for (const c of cards) {
    if (c.kind !== 'credito' || !c.dueDay) continue;
    const { date, period } = nextMonthlyDue(c.dueDay, today, c.paidPeriods, createdOn(c.createdAt));
    const d = daysBetween(today, date);
    items.push({
      key: `card:${c.id}:${period}`,
      source: 'tarjeta',
      sourceId: c.id,
      name: `${c.alias || c.bank} •${c.last4}`,
      category: 'tarjeta',
      amount: c.noInterestPayment ?? c.balance,
      date,
      period,
      daysLeft: d,
      semaforo: semaforo(d),
    });
  }

  for (const b of bills) {
    if (b.recurrence === 'mensual' && b.dueDay) {
      const { date, period } = nextMonthlyDue(b.dueDay, today, b.paidPeriods, createdOn(b.createdAt));
      const d = daysBetween(today, date);
      items.push({
        key: `bill:${b.id}:${period}`,
        source: 'pago',
        sourceId: b.id,
        name: b.name,
        category: b.category,
        amount: b.amount,
        date,
        period,
        daysLeft: d,
        semaforo: semaforo(d),
      });
    } else if (b.recurrence === 'unico' && b.date) {
      const period = periodOf(b.date);
      if (b.paidPeriods?.includes(period)) continue;
      const d = daysBetween(today, b.date);
      items.push({
        key: `bill:${b.id}:${period}`,
        source: 'pago',
        sourceId: b.id,
        name: b.name,
        category: b.category,
        amount: b.amount,
        date: b.date,
        period,
        daysLeft: d,
        semaforo: semaforo(d),
      });
    }
  }

  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}

// ---------- Inversiones ----------

export interface CryptoValuation {
  cost: Cents;
  value: Cents | null;
  gain: Cents | null;
  gainPct: number | null;
}

/** priceMXN: precio actual por unidad en pesos (float de la API). */
export function valueCrypto(h: CryptoHolding, priceMXN: number | undefined): CryptoValuation {
  const cost = Math.round(h.buyPrice * h.quantity);
  if (priceMXN === undefined) return { cost, value: null, gain: null, gainPct: null };
  const value = Math.round(priceMXN * 100 * h.quantity);
  const gain = value - cost;
  return { cost, value, gain, gainPct: cost === 0 ? null : gain / cost };
}

export function fundGain(f: Fund): { gain: Cents; gainPct: number | null } {
  const gain = f.currentValue - f.invested;
  return { gain, gainPct: f.invested === 0 ? null : gain / f.invested };
}
