/**
 * Saldos de cuentas. El saldo se lleva solo con los movimientos CONFIRMADOS:
 * saldo = saldo inicial − gastos + ingresos ± transferencias entre cuentas propias,
 * contando solo movimientos con fecha >= fecha del saldo inicial.
 */
import type { Cents } from './money';
import type { Account, AccountKind, Expense, Income, Transfer } from './types';

export const ACCOUNT_KINDS: Record<AccountKind, string> = {
  banco: 'Banco (débito / nómina)',
  efectivo: 'Efectivo',
  mercado_pago: 'Mercado Pago',
  tarjeta_credito: 'Tarjeta de crédito',
  otra: 'Otra',
};

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
