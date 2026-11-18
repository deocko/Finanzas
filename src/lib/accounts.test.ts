import { describe, expect, it } from 'vitest';
import { accountBalance, onlyLast4, unassignedExpenses } from './accounts';

const account = { id: 'a', initialBalance: 1_000_000, initialDate: '2026-11-01' };

describe('saldo automático de cuentas', () => {
  it('saldo inicial − gastos + ingresos de esa cuenta', () => {
    const b = accountBalance(
      account,
      [
        { amount: 74_299, date: '2026-11-16', accountId: 'a' },
        { amount: 29_900, date: '2026-11-12', accountId: 'a' },
        { amount: 99_999, date: '2026-11-12', accountId: 'otra' },
        { amount: 50_000, date: '2026-11-12' },
      ],
      [{ amount: 12_000, date: '2026-11-10', accountId: 'a' }],
    );
    expect(b.balance).toBe(1_000_000 - 74_299 - 29_900 + 12_000);
    expect(b.spent).toBe(104_199);
    expect(b.received).toBe(12_000);
  });

  it('ignora movimientos anteriores a la fecha del saldo inicial', () => {
    const b = accountBalance(account, [{ amount: 500, date: '2026-10-31', accountId: 'a' }], []);
    expect(b.balance).toBe(1_000_000);
  });

  it('transferencias entre cuentas propias mueven saldo sin ser gasto', () => {
    const t = [{ amount: 200_000, date: '2026-11-13', fromAccountId: 'a', toAccountId: 'cash' }];
    expect(accountBalance(account, [], [], t).balance).toBe(800_000);
    expect(accountBalance({ id: 'cash', initialBalance: 0, initialDate: '2026-11-01' }, [], [], t).balance).toBe(200_000);
  });

  it('puede quedar negativo (sobregiro o deuda de tarjeta) sin redondeos', () => {
    const b = accountBalance({ id: 'a', initialBalance: 1, initialDate: '2026-01-01' }, [{ amount: 3, date: '2026-01-02', accountId: 'a' }], []);
    expect(b.balance).toBe(-2);
  });

  it('«por asignar» = gastos importados sin cuenta', () => {
    const list = [{ importItemId: 'x' }, { importItemId: 'y', accountId: 'a' }, {}];
    expect(unassignedExpenses(list)).toEqual([{ importItemId: 'x' }]);
  });

  it('solo últimos 4 dígitos', () => {
    expect(onlyLast4('4152 3138 0000 1234')).toBe('1234');
  });
});
