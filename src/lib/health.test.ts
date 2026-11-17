import { describe, expect, it } from 'vitest';
import { computeAlerts, possibleDuplicates, unusualCharge } from './alerts';
import {
  DEFAULT_HABITS, addMonthISO, emergencyFund, essentialMonthly, paySelfFirst, rule503020, subscriptions, suggestWait24h, weeklySummary,
} from './health';
import type { Account, Expense, InboxItem, Income } from './types';

const exp = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36).slice(2), createdAt: 0, date: '2026-11-10', concept: 'x', amount: 10_000, category: 'despensa', method: 'debito', ...over,
});
const inc = (over: Partial<Income>): Income => ({ id: 'i', createdAt: 0, date: '2026-11-01', concept: 'Sueldo', amount: 2_000_000, type: 'sueldo', ...over });
const inbox = (over: Partial<InboxItem>): InboxItem => ({
  id: Math.random().toString(36).slice(2), createdAt: 0, extId: 'e', importId: 'imp', source: 'gmail', date: '2026-11-12', merchant: 'Netflix',
  description: '', amount: 29_900, type: 'suscripcion', direction: 'salida', category: 'ocio', status: 'pendiente', ...over,
});

describe('50/30/20', () => {
  it('calcula porcentajes reales y metas', () => {
    const r = rule503020('2026-11', [inc({})], [exp({ amount: 900_000, category: 'despensa' }), exp({ amount: 800_000, category: 'ocio' })], DEFAULT_HABITS);
    expect(r.needsPct).toBe(45);
    expect(r.wantsPct).toBe(40);
    expect(r.savingsPct).toBe(15);
    expect(r.target).toEqual({ needs: 1_000_000, wants: 600_000, savings: 400_000 });
  });
  it('sin ingreso no inventa porcentajes', () => {
    expect(rule503020('2026-11', [], [exp({})], DEFAULT_HABITS).wantsPct).toBeNull();
  });
  it('respeta grupos editados', () => {
    const h = { ...DEFAULT_HABITS, categoryGroups: { ...DEFAULT_HABITS.categoryGroups, despensa: 'deseo' as const } };
    expect(rule503020('2026-11', [inc({})], [exp({ amount: 100_000 })], h).wants).toBe(100_000);
  });
});

describe('fondo de emergencia', () => {
  const expenses = [
    exp({ date: '2026-08-05', amount: 1_000_000 }),
    exp({ date: '2026-09-05', amount: 1_200_000 }),
    exp({ date: '2026-10-05', amount: 1_400_000 }),
    exp({ date: '2026-10-06', amount: 999_999, category: 'ocio' }),
  ];
  it('gasto esencial = promedio de necesidades de 3 meses completos', () => {
    expect(essentialMonthly(expenses, DEFAULT_HABITS, '2026-11-17')).toEqual({ amount: 1_200_000, manual: false, months: 3 });
    expect(essentialMonthly(expenses, { ...DEFAULT_HABITS, essentialMonthlyOverride: 500_000 }, '2026-11-17').manual).toBe(true);
  });
  it('meta, progreso y aporte sugerido', () => {
    const f = emergencyFund({ ...DEFAULT_HABITS, emergencyAccountId: 'ahorro' }, 1_200_000, expenses, [], '2026-11-17');
    expect(f.goal).toBe(3_600_000);
    expect(f.missing).toBe(2_400_000);
    expect(f.suggestedMonthly).toBe(200_000);
    expect(f.progress).toBeCloseTo(1 / 3);
    expect(f.contributedThisMonth).toBe(0);
    const g = emergencyFund({ ...DEFAULT_HABITS, emergencyAccountId: 'ahorro' }, 0, expenses, [{ id: 't', createdAt: 0, date: '2026-11-02', amount: 5_000, toAccountId: 'ahorro', concept: '' }], '2026-11-17');
    expect(g.contributedThisMonth).toBe(5_000);
  });
});

describe('hábitos', () => {
  it('págate primero aparta el % de ahorro', () => {
    expect(paySelfFirst(1_234_567, DEFAULT_HABITS)).toBe(246_913);
  });
  it('regla de 24 h solo para deseos arriba del umbral, y apagada en 0', () => {
    expect(suggestWait24h(500_000, 'ocio', DEFAULT_HABITS)).toBe(false);
    const h = { ...DEFAULT_HABITS, impulseThreshold: 200_000 };
    expect(suggestWait24h(500_000, 'ocio', h)).toBe(true);
    expect(suggestWait24h(500_000, 'despensa', h)).toBe(false);
    expect(suggestWait24h(200_000, 'ocio', h)).toBe(false);
  });
  it('suscripciones: una por comercio, la más reciente, con renovación', () => {
    const s = subscriptions([inbox({ date: '2026-10-12' }), inbox({ date: '2026-11-12' }), inbox({ merchant: 'Xbox', amount: 19_900 }), inbox({ merchant: 'Spotify', status: 'descartado' })]);
    expect(s.map((x) => x.merchant)).toEqual(['Netflix', 'Xbox']);
    expect(s[0]).toMatchObject({ lastDate: '2026-11-12', nextRenewal: '2026-12-12', charges: 2 });
    expect(addMonthISO('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('resumen semanal: de 1 a 3 recomendaciones con datos reales', () => {
    const fund = emergencyFund(DEFAULT_HABITS, undefined, [], [], '2026-11-17');
    const w = weeklySummary({ today: '2026-11-17', incomes: [inc({})], expenses: [exp({ amount: 800_000, category: 'ocio' })], inbox: [], habits: DEFAULT_HABITS, fund });
    expect(w.recs.length).toBeGreaterThanOrEqual(1);
    expect(w.recs.length).toBeLessThanOrEqual(3);
    expect(w.recs[0]!.text).toContain('40 % en deseos; tu meta es 30 %');
  });
});

describe('alertas (solo avisos)', () => {
  const habits = { ...DEFAULT_HABITS, budgets: { despensa: 100_000, ocio: 100_000 }, emergencyAccountId: 'ahorro' };
  const accounts: Account[] = [{ id: 'nom', createdAt: 0, name: 'Nómina', kind: 'banco', initialBalance: 50_000, initialDate: '2026-11-01', lowBalanceThreshold: 100_000 }];
  const balances = new Map([['nom', { accountId: 'nom', balance: 50_000, spent: 0, received: 0, transfersIn: 0, transfersOut: 0 }]]);

  it('cargo inusual = 2× el promedio del comercio', () => {
    const h = [
      { ref: '1', merchant: 'Oxxo', amount: 10_000, date: '2026-11-01' },
      { ref: '2', merchant: 'OXXO', amount: 12_000, date: '2026-11-05' },
    ];
    expect(unusualCharge({ ref: '3', merchant: 'Oxxo', amount: 22_000, date: '2026-11-10' }, h).unusual).toBe(true);
    expect(unusualCharge({ ref: '3', merchant: 'Oxxo', amount: 21_999, date: '2026-11-10' }, h).unusual).toBe(false);
    expect(unusualCharge({ ref: '3', merchant: 'Oxxo', amount: 99_000, date: '2026-11-10' }, h.slice(0, 1)).unusual).toBe(false);
  });
  it('posible duplicado: mismo comercio y monto a ≤ 3 días', () => {
    const d = possibleDuplicates([
      { ref: 'a', merchant: 'Amazon México', amount: 74_299, date: '2026-11-16' },
      { ref: 'b', merchant: 'AMAZON MX', amount: 74_299, date: '2026-11-14' },
      { ref: 'c', merchant: 'Amazon México', amount: 74_299, date: '2026-11-01' },
    ]);
    expect(d.map(([x, y]) => `${x.ref}${y.ref}`)).toEqual(['ba']);
  });
  it('dispara presupuesto (80 % y excedido), renovación, saldo bajo y fondo', () => {
    const fund = emergencyFund(habits, 0, [exp({ date: '2026-10-05', amount: 1_000_000 })], [], '2026-11-17');
    const a = computeAlerts({
      today: '2026-11-10',
      expenses: [exp({ amount: 85_000, category: 'despensa' }), exp({ amount: 150_000, category: 'ocio' })],
      inbox: [inbox({ date: '2026-10-12' })],
      accounts, balances, habits, fund,
    });
    const kinds = a.map((x) => x.id);
    expect(kinds).toContain('presupuesto80-despensa');
    expect(kinds).toContain('presupuesto-ocio');
    expect(kinds).toContain('renovacion-netflix');
    expect(kinds).toContain('saldo-nom');
    expect(kinds).toContain('fondo-meta');
    expect(kinds).toContain('fondo-aporte');
    // cada alerta dice qué pasó y qué hacer, con monto
    for (const x of a) {
      expect(x.title.length).toBeGreaterThan(10);
      expect(x.action.length).toBeGreaterThan(10);
      expect(Number.isInteger(x.amount)).toBe(true);
    }
  });
});
