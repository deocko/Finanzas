import { describe, expect, it } from 'vitest';
import { accountBalance, accountSummary, isCard, isDebt, onlyLast4, unassignedExpenses } from './accounts';

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

describe('saldos: confirmados vs pendientes (Mensaje 4)', () => {
  const acc = { id: 'a', initialBalance: 1_000_000, initialDate: '2026-11-01' };
  const exp = [{ amount: 30_000, date: '2026-11-05', accountId: 'a' }, { amount: 99_999, date: '2026-10-30', accountId: 'a' }];
  const inc = [{ amount: 2_590_000, date: '2026-11-13', accountId: 'a' }];
  const inbox = [
    { amount: 11_900, accountId: 'a', status: 'pendiente' as const, direction: 'salida' as const, date: '2026-11-15' },
    { amount: 2_590_000, accountId: 'a', status: 'pendiente' as const, direction: 'entrada' as const, date: '2026-11-28' },
    { amount: 50_000, accountId: 'a', status: 'descartado' as const, direction: 'salida' as const, date: '2026-11-16' },
    { amount: 70_000, accountId: 'otra', status: 'pendiente' as const, direction: 'salida' as const, date: '2026-11-16' },
  ];

  it('lo pendiente no cambia el saldo confirmado; solo la proyección', () => {
    const s = accountSummary(acc, exp, inc, [], inbox);
    expect(s.confirmed).toBe(1_000_000 - 30_000 + 2_590_000);
    expect(s.netConfirmed).toBe(2_560_000);
    expect(s.pendingOut).toBe(11_900);
    expect(s.pendingIn).toBe(2_590_000);
    expect(s.pendingCount).toBe(2);
    expect(s.projected).toBe(s.confirmed! - 11_900 + 2_590_000);
  });

  it('saldo inicial por confirmar: no se inventa saldo, pero sí se ve el neto de TODO lo confirmado', () => {
    const s = accountSummary({ ...acc, initialBalance: 0, balancePending: true }, exp, inc, [], inbox);
    expect(s.confirmed).toBeNull();
    expect(s.projected).toBeNull();
    // Sin fecha de saldo real, cuenta también el gasto del 30 oct
    expect(s.netConfirmed).toBe(2_590_000 - 30_000 - 99_999);
  });

  it('tarjetas y préstamos', () => {
    expect(isCard('tarjeta_servicios')).toBe(true);
    expect(isCard('hipotecario')).toBe(false);
    expect(isDebt('hipotecario')).toBe(true);
  });
});
