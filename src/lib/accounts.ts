/**
 * Saldos de cuentas. El saldo se lleva solo con los movimientos CONFIRMADOS:
 * saldo = saldo inicial − gastos + ingresos ± transferencias entre cuentas propias,
 * contando solo movimientos con fecha >= fecha del saldo inicial.
 */
import type { Cents } from './money';
import type { Account, AccountKind, Expense, InboxItem, Income, Transfer } from './types';

export const ACCOUNT_KINDS: Record<AccountKind, string> = {
  banco: 'Banco (débito / nómina)',
  efectivo: 'Efectivo',
  mercado_pago: 'Mercado Pago',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_servicios: 'Tarjeta de servicios',
  tarjeta: 'Tarjeta (tipo por confirmar)',
  hipotecario: 'Crédito hipotecario',
  otra: 'Otra',
};

/** Tarjetas: llevan fecha de corte y fecha límite de pago. */
export function isCard(kind: AccountKind): boolean {
  return kind === 'tarjeta_credito' || kind === 'tarjeta_servicios' || kind === 'tarjeta';
}

/** Cuentas cuyo saldo es deuda (tarjetas y préstamos). */
export function isDebt(kind: AccountKind): boolean {
  return isCard(kind) || kind === 'hipotecario';
}

export interface AccountBalance {
  accountId: string;
  balance: Cents;
  spent: Cents;
  received: Cents;
  transfersIn: Cents;
  transfersOut: Cents;
}

export function accountBalance(
  account: Pick<Account, 'id' | 'initialBalance' | 'initialDate'>,
  expenses: readonly Pick<Expense, 'amount' | 'date' | 'accountId'>[],
  incomes: readonly Pick<Income, 'amount' | 'date' | 'accountId'>[],
  transfers: readonly Pick<Transfer, 'amount' | 'date' | 'fromAccountId' | 'toAccountId'>[] = [],
): AccountBalance {
  const after = (d: string) => d >= account.initialDate;
  let spent = 0;
  let received = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  for (const e of expenses) if (e.accountId === account.id && after(e.date)) spent += e.amount;
  for (const i of incomes) if (i.accountId === account.id && after(i.date)) received += i.amount;
  for (const t of transfers) {
    if (!after(t.date)) continue;
    if (t.toAccountId === account.id) transfersIn += t.amount;
    if (t.fromAccountId === account.id) transfersOut += t.amount;
  }
  return {
    accountId: account.id,
    balance: account.initialBalance - spent + received + transfersIn - transfersOut,
    spent,
    received,
    transfersIn,
    transfersOut,
  };
}

export function allBalances(
  accounts: readonly Account[],
  expenses: readonly Expense[],
  incomes: readonly Income[],
  transfers: readonly Transfer[],
): Map<string, AccountBalance> {
  return new Map(accounts.map((a) => [a.id, accountBalance(a, expenses, incomes, transfers)]));
}

/** Gastos confirmados sin cuenta: «por asignar». */
export function unassignedExpenses<T extends Pick<Expense, 'accountId' | 'importItemId'>>(expenses: readonly T[]): T[] {
  return expenses.filter((e) => !e.accountId && !!e.importItemId);
}

/** Solo últimos 4 dígitos (por si se pega el número completo). */
export function onlyLast4(input: string): string {
  return input.replace(/\D/g, '').slice(-4);
}

export interface AccountSummary extends AccountBalance {
  /** Saldo con movimientos confirmados; null si el saldo inicial está por confirmar. */
  confirmed: Cents | null;
  /** Neto de movimientos confirmados desde la fecha del saldo inicial (+ entra, − sale); todos si el saldo está por confirmar. */
  netConfirmed: Cents;
  /** Detectados por Byte y aún sin confirmar, asignados a esta cuenta. */
  pendingOut: Cents;
  pendingIn: Cents;
  pendingCount: number;
  /** Saldo si Diego confirmara todo lo pendiente; null si el saldo inicial está por confirmar. */
  projected: Cents | null;
}

/**
 * Saldo de una cuenta separando lo confirmado de lo pendiente.
 * Lo pendiente NUNCA cambia el saldo confirmado; solo se muestra como proyección.
 */
export function accountSummary(
  account: Pick<Account, 'id' | 'initialBalance' | 'initialDate' | 'balancePending'>,
  expenses: readonly Pick<Expense, 'amount' | 'date' | 'accountId'>[],
  incomes: readonly Pick<Income, 'amount' | 'date' | 'accountId'>[],
  transfers: readonly Pick<Transfer, 'amount' | 'date' | 'fromAccountId' | 'toAccountId'>[],
  inbox: readonly Pick<InboxItem, 'amount' | 'accountId' | 'status' | 'direction' | 'date'>[],
): AccountSummary {
  // Con el saldo inicial por confirmar no hay fecha de corte real: se cuentan todos los movimientos confirmados.
  const b = accountBalance(account.balancePending ? { ...account, initialDate: '0000-01-01' } : account, expenses, incomes, transfers);
  let pendingOut = 0;
  let pendingIn = 0;
  let pendingCount = 0;
  for (const i of inbox) {
    if (i.status !== 'pendiente' || i.accountId !== account.id) continue;
    pendingCount++;
    if (i.direction === 'entrada') pendingIn += i.amount;
    else pendingOut += i.amount;
  }
  const netConfirmed = b.received + b.transfersIn - b.spent - b.transfersOut;
  const confirmed = account.balancePending ? null : b.balance;
  return {
    ...b,
    confirmed,
    netConfirmed,
    pendingOut,
    pendingIn,
    pendingCount,
    projected: confirmed === null ? null : confirmed + pendingIn - pendingOut,
  };
}
