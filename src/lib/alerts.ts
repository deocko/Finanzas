/**
 * Alertas: AVISOS, nunca acciones. Ninguna alerta mueve dinero, cancela algo ni confirma un gasto.
 * Cada alerta dice qué pasó, cuánto es y qué puede hacer Diego.
 */
import type { Cents } from './money';
import { formatMXN, sumCents } from './money';
import type { ISODate } from './dates';
import { daysBetween, formatDate, periodOf } from './dates';
import { CATEGORIES, CATEGORY_ORDER } from './catalog';
import { merchantKey } from './ingest';
import type { EmergencyFund, HabitsData } from './health';
import { subscriptions } from './health';
import type { Account, Expense, InboxItem } from './types';
import type { AccountBalance } from './accounts';

export type AlertKind = 'presupuesto' | 'inusual' | 'renovacion' | 'duplicado' | 'saldo_bajo' | 'fondo';
export type AlertLevel = 'alta' | 'media' | 'info';

export interface FinAlert {
  id: string;
  kind: AlertKind;
  level: AlertLevel;
  /** Qué pasó. */
  title: string;
  /** Cuánto es. */
  amount: Cents;
  /** Qué puede hacer Diego. */
  action: string;
  /** A dónde llevarlo en la app. */
  link: string;
}

/** Algo con comercio, monto y fecha: un gasto confirmado o un renglón pendiente. */
export interface Charge {
  ref: string;
  merchant: string;
  amount: Cents;
  date: ISODate;
}

export function chargeOfExpense(e: Expense): Charge | null {
  const merchant = e.merchant ?? e.store;
  return merchant ? { ref: `exp:${e.id}`, merchant, amount: e.amount, date: e.date } : null;
}

export function chargeOfInbox(i: InboxItem): Charge {
  return { ref: `inbox:${i.id}`, merchant: i.merchant, amount: i.amount, date: i.date };
}

/** Cargo inusual: 2 veces o más el promedio de ese comercio (se necesitan al menos 2 cargos previos). */
export function unusualCharge(c: Charge, history: readonly Charge[], factor = 2): { unusual: boolean; average: Cents } {
  const key = merchantKey(c.merchant);
  const prev = history.filter((h) => h.ref !== c.ref && merchantKey(h.merchant) === key && h.date <= c.date);
  if (prev.length < 2) return { unusual: false, average: 0 };
  const average = Math.round(sumCents(prev.map((p) => p.amount)) / prev.length);
  return { unusual: average > 0 && c.amount >= average * factor, average };
}

/** Pares de posibles duplicados: mismo comercio, mismo monto y fechas a 3 días o menos. */
export function possibleDuplicates(charges: readonly Charge[], maxDays = 3): [Charge, Charge][] {
  const out: [Charge, Charge][] = [];
  const sorted = [...charges].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const ka = merchantKey(a.merchant);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (daysBetween(a.date, b.date) > maxDays) break;
      if (a.amount === b.amount && merchantKey(b.merchant) === ka) out.push([a, b]);
    }
  }
  return out;
}

export interface AlertsInput {
  today: ISODate;
  expenses: readonly Expense[];
  inbox: readonly InboxItem[];
  accounts: readonly Account[];
  balances: Map<string, AccountBalance>;
  habits: HabitsData;
  fund: EmergencyFund;
}

const ORDER: Record<AlertLevel, number> = { alta: 0, media: 1, info: 2 };

export function computeAlerts(input: AlertsInput): FinAlert[] {
  const { today, habits } = input;
  const period = periodOf(today);
  const alerts: FinAlert[] = [];

  // 1. Presupuesto por categoría: al 80 % y al excederse
  for (const cat of CATEGORY_ORDER) {
    const budget = habits.budgets[cat];
    if (!budget || budget <= 0) continue;
    const spent = sumCents(input.expenses.filter((e) => e.category === cat && periodOf(e.date) === period).map((e) => e.amount));
    const label = CATEGORIES[cat].label;
    if (spent > budget) {
      alerts.push({
        id: `presupuesto-${cat}`, kind: 'presupuesto', level: 'alta',
        title: `Excediste el presupuesto de ${label}: ${formatMXN(spent)} de ${formatMXN(budget)}.`,
        amount: spent - budget,
        action: `Vas ${formatMXN(spent - budget)} arriba. Evita más gastos en ${label} este mes o ajusta el presupuesto en Ajustes.`,
        link: '/movimientos',
      });
    } else if (spent >= budget * 0.8) {
      alerts.push({
        id: `presupuesto80-${cat}`, kind: 'presupuesto', level: 'media',
        title: `Llevas ${Math.round((spent / budget) * 100)} % del presupuesto de ${label}.`,
        amount: budget - spent,
        action: `Te quedan ${formatMXN(budget - spent)} para ${label} este mes.`,
        link: '/movimientos',
      });
    }
  }

  // Historial de cargos: gastos confirmados + renglones pendientes
  const confirmed = input.expenses.map(chargeOfExpense).filter((c): c is Charge => c !== null);
  const pending = input.inbox.filter((i) => i.status === 'pendiente' && i.direction === 'salida').map(chargeOfInbox);
  const all = [...confirmed, ...pending];

  // 2. Cargo inusual (últimos 30 días)
  for (const c of all) {
    if (daysBetween(c.date, today) > 30) continue;
    const u = unusualCharge(c, all);
    if (u.unusual) {
      alerts.push({
        id: `inusual-${c.ref}`, kind: 'inusual', level: 'alta',
        title: `Cargo inusual en ${c.merchant}: ${formatMXN(c.amount)} el ${formatDate(c.date)} (tu promedio ahí es ${formatMXN(u.average)}).`,
        amount: c.amount,
        action: 'Revisa que lo reconozcas. Si no, repórtalo a tu banco; la app no hace nada por su cuenta.',
        link: c.ref.startsWith('inbox:') ? '/importar' : '/movimientos',
      });
    }
  }

  // 3. Suscripción próxima a renovarse
  for (const s of subscriptions(input.inbox)) {
    const days = daysBetween(today, s.nextRenewal);
    if (days >= 0 && days <= habits.renewalNoticeDays) {
      alerts.push({
        id: `renovacion-${s.key}`, kind: 'renovacion', level: 'media',
        title: `${s.merchant} se renueva ${days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`} (${formatDate(s.nextRenewal)}) por ${formatMXN(s.monthly)}.`,
        amount: s.monthly,
        action: 'Si ya no la usas, cancélala tú directamente en el servicio antes de esa fecha.',
        link: '/salud',
      });
    }
  }

  // 4. Posible gasto duplicado (recientes)
  for (const [a, b] of possibleDuplicates(all)) {
    if (daysBetween(b.date, today) > 30) continue;
    alerts.push({
      id: `duplicado-${a.ref}-${b.ref}`, kind: 'duplicado', level: 'media',
      title: `Posible cargo duplicado en ${a.merchant}: ${formatMXN(a.amount)} el ${formatDate(a.date)} y el ${formatDate(b.date)}.`,
      amount: a.amount,
      action: 'Si es el mismo cargo, descarta o elimina uno. Si tu banco te cobró dos veces, repórtalo.',
      link: a.ref.startsWith('inbox:') || b.ref.startsWith('inbox:') ? '/importar' : '/movimientos',
    });
  }

  // 5. Saldo bajo
  for (const acc of input.accounts) {
    if (!acc.lowBalanceThreshold || acc.lowBalanceThreshold <= 0) continue;
    const bal = input.balances.get(acc.id)?.balance ?? acc.initialBalance;
    if (bal < acc.lowBalanceThreshold) {
      alerts.push({
        id: `saldo-${acc.id}`, kind: 'saldo_bajo', level: 'alta',
        title: `Saldo bajo en ${acc.name}: ${formatMXN(bal)} (tu umbral es ${formatMXN(acc.lowBalanceThreshold)}).`,
        amount: bal,
        action: 'Revisa los próximos cargos de esa cuenta o pasa dinero desde otra cuenta.',
        link: '/cuentas',
      });
    }
  }

  // 6. Fondo de emergencia
  const f = input.fund;
  if (f.configured && f.goal > 0) {
    if (f.current < f.goal) {
      alerts.push({
        id: 'fondo-meta', kind: 'fondo', level: 'info',
        title: `Tu fondo de emergencia está en ${formatMXN(f.current)} de ${formatMXN(f.goal)} (${Math.round(f.progress * 100)} %).`,
        amount: f.missing,
        action: `Te faltan ${formatMXN(f.missing)}. Aporte sugerido: ${formatMXN(f.suggestedMonthly)} al mes.`,
        link: '/salud',
      });
    }
    if (f.contributedThisMonth === 0 && f.current < f.goal) {
      alerts.push({
        id: 'fondo-aporte', kind: 'fondo', level: 'media',
        title: 'Este mes no has aportado a tu fondo de emergencia.',
        amount: f.suggestedMonthly,
        action: `Registra un aporte de ${formatMXN(f.suggestedMonthly)} en Cuentas cuando lo apartes.`,
        link: '/cuentas',
      });
    }
  }

  return alerts.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
