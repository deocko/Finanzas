import { describe, expect, it } from 'vitest';
import { SETUP_ACCOUNTS, planSetup } from './setup';
import { baseRubros } from './rubros';

const empty = { accounts: [], rubros: [], merchantRubros: [], recurrings: [] };

describe('alta inicial de cuentas', () => {
  it('da de alta las 10 cuentas + Efectivo, sin saldos, límites, fechas ni dígitos', () => {
    const ops = planSetup(empty, '2026-11-17');
    const accs = ops.filter((o) => o.col === 'accounts');
    expect(accs.map((o) => o.data.name)).toEqual([
      'Nómina Banamex', 'Nómina Bancomer', 'BBVA Azul', 'Amex Green', 'Amex Business', 'Amex Credit Card', 'Mercado Pago', 'Plata Card', 'Invex Walmart', 'Hipotecario BBVA', 'Efectivo',
    ]);
    for (const o of accs) {
      if (o.col !== 'accounts') continue;
      expect(o.data).toMatchObject({ balancePending: true, initialBalance: 0 });
      expect(o.data.last4).toBeUndefined();
      expect(o.data.cutDay).toBeUndefined();
      expect(o.data.dueDay).toBeUndefined();
      expect(o.data.creditLimit).toBeUndefined();
    }
    const kind = (n: string) => accs.find((o) => o.data.name === n)!.data;
    expect(kind('Amex Green')).toMatchObject({ kind: 'tarjeta_servicios', institution: 'American Express' });
    expect(kind('Hipotecario BBVA').kind).toBe('hipotecario');
    expect(kind('Nómina Banamex').kind).toBe('banco');
  });

  it('conserva la cuenta de Efectivo que ya existe (no crea otra)', () => {
    const ops = planSetup({ ...empty, accounts: [{ id: 'mvp-cash', kind: 'efectivo' }] }, '2026-11-17');
    expect(ops.filter((o) => o.col === 'accounts')).toHaveLength(SETUP_ACCOUNTS.length);
  });

  it('es idempotente: lo que ya existe no se vuelve a crear', () => {
    const first = planSetup(empty, '2026-11-17');
    const existing = {
      accounts: first.filter((o) => o.col === 'accounts').map((o) => ({ id: o.id, kind: (o.data as { kind: 'banco' }).kind })),
      rubros: first.filter((o) => o.col === 'rubros').map((o) => ({ id: o.id })),
      merchantRubros: first.filter((o) => o.col === 'merchantRubros').map((o) => ({ id: o.id, merchantKey: (o.data as { merchantKey: string }).merchantKey })),
      recurrings: first.filter((o) => o.col === 'recurrings').map((o) => ({ id: o.id })),
    };
    expect(planSetup(existing, '2026-11-18')).toEqual([]);
    expect(first.filter((o) => o.col === 'rubros')).toHaveLength(baseRubros().length);
  });

  it('no pisa una regla de comercio que Diego ya tenga', () => {
    const ops = planSetup({ ...empty, merchantRubros: [{ id: 'mia', merchantKey: 'spotify' }] }, '2026-11-17');
    expect(ops.some((o) => o.col === 'merchantRubros' && (o.data as { merchantKey: string }).merchantKey === 'spotify')).toBe(false);
  });
});
