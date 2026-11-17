/**
 * Salud financiera: guías y recomendaciones. NADA se ejecuta solo: la app sugiere, Diego decide.
 */
import type { Cents } from './money';
import { formatMXN, mulCents, sumCents } from './money';
import type { ISODate, Period } from './dates';
import { addMonths, dateInMonth, daysBetween, parseISODate, periodOf } from './dates';
import { CATEGORIES, CATEGORY_ORDER } from './catalog';
import { merchantKey } from './ingest';
import type { Expense, ExpenseCategory, Habits, InboxItem, Income, SpendGroup, Transfer } from './types';

export const DEFAULT_CATEGORY_GROUPS: Record<ExpenseCategory, SpendGroup> = {
  gas: 'necesidad',
  luz: 'necesidad',
  agua: 'necesidad',
  telefonia: 'necesidad',
  colegiaturas: 'necesidad',
  despensa: 'necesidad',
  mantenimiento: 'necesidad',
  transporte: 'necesidad',
  salud: 'necesidad',
  ocio: 'deseo',
  otros: 'deseo',
};

export type HabitsData = Omit<Habits, 'id' | 'createdAt'>;

/** Valores iniciales. Los porcentajes 50/30/20 son la regla clásica; Diego debe confirmarlos. */
export const DEFAULT_HABITS: HabitsData = {
  needsPct: 50,
  wantsPct: 30,
  savingsPct: 20,
  categoryGroups: DEFAULT_CATEGORY_GROUPS,
  emergencyMonths: 3,
  emergencyHorizonMonths: 12,
  impulseThreshold: 0,
  budgets: {},
  renewalNoticeDays: 3,
  merchantRulesEnabled: false,
};

export function withDefaults(h: Partial<HabitsData> | undefined): HabitsData {
  return {
    ...DEFAULT_HABITS,
    ...(h ?? {}),
    categoryGroups: { ...DEFAULT_CATEGORY_GROUPS, ...(h?.categoryGroups ?? {}) },
    budgets: { ...(h?.budgets ?? {}) },
  };
}

export function groupOf(category: ExpenseCategory, habits: Pick<HabitsData, 'categoryGroups'>): SpendGroup {
  return habits.categoryGroups[category] ?? DEFAULT_CATEGORY_GROUPS[category];
}

// ---------- 50/30/20 ----------

export interface Rule503020 {
  period: Period;
  income: Cents;
  needs: Cents;
  wants: Cents;
  /** Lo que queda: ingreso − necesidades − deseos (puede ser negativo). */
  savings: Cents;
  /** Porcentaje real sobre el ingreso (null si no hubo ingreso). */
  needsPct: number | null;
  wantsPct: number | null;
  savingsPct: number | null;
  target: { needs: Cents; wants: Cents; savings: Cents };
}

const pct = (part: Cents, whole: Cents) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export function rule503020(period: Period, incomes: readonly Income[], expenses: readonly Expense[], habits: HabitsData): Rule503020 {
  const income = sumCents(incomes.filter((i) => periodOf(i.date) === period).map((i) => i.amount));
  let needs = 0;
  let wants = 0;
  for (const e of expenses) {
    if (periodOf(e.date) !== period) continue;
    if (groupOf(e.category, habits) === 'necesidad') needs += e.amount;
    else wants += e.amount;
  }
  const savings = income - needs - wants;
  return {
    period, income, needs, wants, savings,
    needsPct: pct(needs, income),
    wantsPct: pct(wants, income),
    savingsPct: pct(savings, income),
    target: {
      needs: mulCents(income, habits.needsPct / 100),
      wants: mulCents(income, habits.wantsPct / 100),
      savings: mulCents(income, habits.savingsPct / 100),
    },
  };
}

// ---------- Fondo de emergencia ----------

/** Gasto esencial mensual: el fijado a mano, o el promedio de necesidades de los 3 meses completos anteriores. */
export function essentialMonthly(expenses: readonly Expense[], habits: HabitsData, today: ISODate): { amount: Cents; manual: boolean; months: number } {
  if (habits.essentialMonthlyOverride && habits.essentialMonthlyOverride > 0) {
    return { amount: habits.essentialMonthlyOverride, manual: true, months: 0 };
  }
  const current = periodOf(today);
  const periods = [1, 2, 3].map((k) => addMonths(current, -k));
  const totals = periods.map((p) =>
    sumCents(expenses.filter((e) => periodOf(e.date) === p && groupOf(e.category, habits) === 'necesidad').map((e) => e.amount)),
  );
  const withData = totals.filter((t) => t > 0);
  if (!withData.length) return { amount: 0, manual: false, months: 0 };
  return { amount: Math.round(sumCents(withData) / withData.length), manual: false, months: withData.length };
}

export interface EmergencyFund {
  configured: boolean;
  essential: Cents;
  goal: Cents;
  current: Cents;
  progress: number;
  missing: Cents;
  suggestedMonthly: Cents;
  contributedThisMonth: Cents;
}

export function emergencyFund(
  habits: HabitsData,
  currentBalance: Cents | undefined,
  expenses: readonly Expense[],
  transfers: readonly Transfer[],
  today: ISODate,
): EmergencyFund {
  const ess = essentialMonthly(expenses, habits, today);
  const goal = ess.amount * Math.max(0, habits.emergencyMonths);
  const current = Math.max(0, currentBalance ?? 0);
  const missing = Math.max(0, goal - current);
  const horizon = Math.max(1, Math.round(habits.emergencyHorizonMonths));
  const period = periodOf(today);
  const contributedThisMonth = habits.emergencyAccountId
    ? sumCents(transfers.filter((t) => t.toAccountId === habits.emergencyAccountId && periodOf(t.date) === period).map((t) => t.amount))
    : 0;
  return {
    configured: !!habits.emergencyAccountId,
    essential: ess.amount,
    goal,
    current,
    progress: goal > 0 ? Math.min(1, current / goal) : 0,
    missing,
    suggestedMonthly: Math.ceil(missing / horizon),
    contributedThisMonth,
  };
}

// ---------- Págate primero y regla de 24 horas ----------

export function paySelfFirst(incomeAmount: Cents, habits: Pick<HabitsData, 'savingsPct'>): Cents {
  return mulCents(incomeAmount, habits.savingsPct / 100);
}

export function suggestWait24h(amount: Cents, category: ExpenseCategory, habits: HabitsData): boolean {
  return habits.impulseThreshold > 0 && groupOf(category, habits) === 'deseo' && amount > habits.impulseThreshold;
}

// ---------- Auditoría de suscripciones ----------

export interface Subscription {
  key: string;
  merchant: string;
  monthly: Cents;
  lastDate: ISODate;
  nextRenewal: ISODate;
  charges: number;
  type: 'suscripcion' | 'cargo_recurrente';
}

export function addMonthISO(date: ISODate, n: number): ISODate {
  const { y, m, d } = parseISODate(date);
  const [ny = y, nm = m] = addMonths(`${y}-${String(m).padStart(2, '0')}`, n).split('-').map(Number);
  return dateInMonth(ny, nm, d);
}

/** Cargos recurrentes detectados (pendientes o confirmados, no descartados), uno por comercio. */
export function subscriptions(items: readonly InboxItem[]): Subscription[] {
  const map = new Map<string, Subscription>();
  for (const it of items) {
    if (it.status === 'descartado' || it.direction !== 'salida') continue;
    if (it.type !== 'suscripcion' && it.type !== 'cargo_recurrente') continue;
    const key = merchantKey(it.merchant);
    const prev = map.get(key);
    if (!prev || it.date > prev.lastDate) {
      map.set(key, {
        key, merchant: it.merchant, monthly: it.amount, lastDate: it.date,
        nextRenewal: addMonthISO(it.date, 1), charges: (prev?.charges ?? 0) + 1, type: it.type,
      });
    } else prev.charges += 1;
  }
  return [...map.values()].sort((a, b) => b.monthly - a.monthly);
}

// ---------- Resumen semanal ----------

export interface Recommendation {
  id: string;
  text: string;
}

export interface WeeklyInput {
  today: ISODate;
  incomes: readonly Income[];
  expenses: readonly Expense[];
  inbox: readonly InboxItem[];
  habits: HabitsData;
  fund: EmergencyFund;
}

/** 1 a 3 recomendaciones concretas con los datos reales. Si no hay datos, lo dice. */
export function weeklySummary(input: WeeklyInput): { week: Cents; prevWeek: Cents; recs: Recommendation[] } {
  const { today, habits } = input;
  const inRange = (d: string, from: number, to: number) => {
    const k = daysBetween(d, today);
    return k >= from && k < to;
  };
  const week = sumCents(input.expenses.filter((e) => inRange(e.date, 0, 7)).map((e) => e.amount));
  const prevWeek = sumCents(input.expenses.filter((e) => inRange(e.date, 7, 14)).map((e) => e.amount));
  const r = rule503020(periodOf(today), input.incomes, input.expenses, habits);
  const recs: Recommendation[] = [];

  const pending = input.inbox.filter((i) => i.status === 'pendiente').length;
  if (pending) recs.push({ id: 'pendientes', text: `Tienes ${pending} ${pending === 1 ? 'movimiento importado' : 'movimientos importados'} del correo por confirmar. Revísalos en Importar para que tus saldos estén al día.` });

  if (r.wantsPct !== null && r.wantsPct > habits.wantsPct) {
    recs.push({ id: 'deseos', text: `Este mes llevas ${r.wantsPct} % en deseos; tu meta es ${habits.wantsPct} % (${formatMXN(r.wants)} de ${formatMXN(r.target.wants)}). Considera pausar compras no esenciales lo que resta del mes.` });
  }
  if (r.needsPct !== null && r.needsPct > habits.needsPct) {
    recs.push({ id: 'necesidades', text: `Las necesidades van en ${r.needsPct} % del ingreso; tu meta es ${habits.needsPct} %. Revisa servicios o despensa para encontrar ahorro.` });
  }
  for (const cat of CATEGORY_ORDER) {
    const b = habits.budgets[cat];
    if (!b) continue;
    const spent = sumCents(input.expenses.filter((e) => e.category === cat && periodOf(e.date) === r.period).map((e) => e.amount));
    if (spent > b) recs.push({ id: `presupuesto-${cat}`, text: `Ya pasaste tu presupuesto de ${CATEGORIES[cat].label}: ${formatMXN(spent)} de ${formatMXN(b)}.` });
  }
  if (input.fund.configured && input.fund.missing > 0 && input.fund.contributedThisMonth === 0) {
    recs.push({ id: 'fondo', text: `Tu fondo de emergencia va en ${Math.round(input.fund.progress * 100)} %. Apartar ${formatMXN(input.fund.suggestedMonthly)} este mes te mantiene en camino a la meta de ${formatMXN(input.fund.goal)}.` });
  } else if (!input.fund.configured) {
    recs.push({ id: 'fondo-config', text: 'Elige en Ajustes la cuenta de tu fondo de emergencia para dar seguimiento a la meta.' });
  }
  if (r.savingsPct !== null && r.savingsPct < habits.savingsPct && r.income > 0) {
    recs.push({ id: 'ahorro', text: `Este mes te queda ${r.savingsPct} % para ahorro; tu meta es ${habits.savingsPct} % (${formatMXN(r.target.savings)}).` });
  }
  const subs = subscriptions(input.inbox);
  if (subs.length) {
    const total = sumCents(subs.map((s) => s.monthly));
    recs.push({ id: 'suscripciones', text: `Pagas ${formatMXN(total)} al mes en ${subs.length} ${subs.length === 1 ? 'suscripción' : 'suscripciones'}. Revisa si sigues usando todas.` });
  }
  if (prevWeek > 0 && week > prevWeek * 1.3) {
    recs.push({ id: 'semana', text: `Esta semana gastaste ${formatMXN(week)}, ${Math.round((week / prevWeek - 1) * 100)} % más que la anterior (${formatMXN(prevWeek)}).` });
  }
  if (!recs.length) {
    recs.push({ id: 'ok', text: r.income > 0 ? 'Vas dentro de tus metas este mes. Sigue registrando tus movimientos.' : 'Aún no hay ingresos registrados este mes: regístralos para comparar contra tu regla 50/30/20.' });
  }
  return { week, prevWeek, recs: recs.slice(0, 3) };
}
