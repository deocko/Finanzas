import { describe, expect, it } from 'vitest';
import {
  cardTotals, dueItems, expensesByCategory, fundGain, monthSummary, monthlySeries, nextMonthlyDue, semaforo, valueCrypto,
} from './finance';
import { daysBetween, dateInMonth, addMonths } from './dates';
import type { Bill, Card, Expense, Income } from './types';

const T0 = new Date(2026, 0, 1).getTime(); // alta: 1 ene 2026

const inc = (date: string, amount: number): Income => ({ id: date + amount, createdAt: T0, date, concept: 'x', amount, type: 'sueldo' });
const exp = (date: string, amount: number, category: Expense['category'] = 'otros'): Expense => ({
  id: date + amount + category, createdAt: T0, date, concept: 'x', amount, category, method: 'efectivo',
});

describe('fechas', () => {
  it('daysBetween', () => {
    expect(daysBetween('2026-11-16', '2026-11-16')).toBe(0);
    expect(daysBetween('2026-11-16', '2026-12-01')).toBe(15);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2); // bisiesto
  });
  it('día 31 en meses cortos se ajusta', () => {
    expect(dateInMonth(2026, 2, 31)).toBe('2026-02-28');
    expect(dateInMonth(2028, 2, 31)).toBe('2028-02-29');
    expect(dateInMonth(2026, 4, 31)).toBe('2026-04-30');
  });
  it('addMonths cruza años', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', -11)).toBe('2025-12');
  });
});

describe('balance del mes', () => {
  const incomes = [inc('2026-11-01', 1_500_000), inc('2026-11-15', 1_500_000), inc('2026-10-30', 999_999)];
  const expenses = [exp('2026-11-03', 123_456), exp('2026-11-30', 1), exp('2026-12-01', 50_000)];
  it('ingresos − gastos, solo del periodo', () => {
    expect(monthSummary('2026-11', incomes, expenses)).toEqual({
      period: '2026-11', income: 3_000_000, expense: 123_457, balance: 2_876_543,
    });
  });
  it('balance negativo', () => {
    expect(monthSummary('2026-12', incomes, expenses).balance).toBe(-50_000);
  });
  it('serie mensual acumulada', () => {
    const s = monthlySeries('2026-12', 3, incomes, expenses);
    expect(s.map((x) => x.period)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(s.map((x) => x.cumulative)).toEqual([999_999, 999_999 + 2_876_543, 999_999 + 2_876_543 - 50_000]);
  });
  it('gasto por categoría ordenado', () => {
    const r = expensesByCategory([exp('2026-11-01', 100, 'luz'), exp('2026-11-02', 300, 'gas'), exp('2026-11-03', 250, 'luz')], '2026-11');
    expect(r).toEqual([{ category: 'luz', total: 350 }, { category: 'gas', total: 300 }]);
  });
});

describe('tarjetas', () => {
  const base = { createdAt: T0, bank: 'B', alias: '', brand: 'visa' as const, holder: 'X', color: '#000' };
  const cards: Card[] = [
    { ...base, id: 'a', kind: 'credito', last4: '1111', balance: 500_000, creditLimit: 2_000_000 },
    { ...base, id: 'b', kind: 'credito', last4: '2222', balance: 2_500_000, creditLimit: 2_000_000 },
    { ...base, id: 'c', kind: 'debito', last4: '3333', balance: 123_45 },
  ];
  it('totales', () => {
    expect(cardTotals(cards)).toEqual({ creditDebt: 3_000_000, debitAvailable: 12_345, creditAvailable: 1_500_000 });
  });
});

describe('vencimientos', () => {
  it('semáforo', () => {
    expect(semaforo(-2)).toBe('rojo');
    expect(semaforo(0)).toBe('rojo');
    expect(semaforo(3)).toBe('rojo');
    expect(semaforo(4)).toBe('amarillo');
    expect(semaforo(7)).toBe('amarillo');
    expect(semaforo(8)).toBe('verde');
  });
  it('mensual: si el mes anterior no se pagó, aparece vencido', () => {
    expect(nextMonthlyDue(10, '2026-11-16', [], '2026-01-01')).toEqual({ date: '2026-10-10', period: '2026-10' });
  });
  it('mensual: pagado el anterior → este mes', () => {
    expect(nextMonthlyDue(10, '2026-11-16', ['2026-10'], '2026-01-01')).toEqual({ date: '2026-11-10', period: '2026-11' });
  });
  it('mensual: pagados anterior y actual → siguiente mes', () => {
    expect(nextMonthlyDue(10, '2026-11-16', ['2026-10', '2026-11'])).toEqual({ date: '2026-12-10', period: '2026-12' });
  });
  it('no cobra ocurrencias anteriores al alta', () => {
    expect(nextMonthlyDue(5, '2026-11-16', [], '2026-11-16')).toEqual({ date: '2026-12-05', period: '2026-12' });
    expect(nextMonthlyDue(20, '2026-11-16', [], '2026-11-16')).toEqual({ date: '2026-11-20', period: '2026-11' });
  });
  it('día 31 en febrero', () => {
    expect(nextMonthlyDue(31, '2027-02-10', ['2027-01'], '2026-01-01')).toEqual({ date: '2027-02-28', period: '2027-02' });
  });
  it('lista ordenada con días restantes, tarjetas y pagos', () => {
    const created = new Date(2026, 10, 1).getTime(); // 1 nov 2026
    const cards: Card[] = [{
      id: 'c', createdAt: created, kind: 'credito', bank: 'Banco', alias: 'Oro', brand: 'visa', last4: '4321', holder: 'X',
      color: '#000', balance: 800_000, noInterestPayment: 650_000, dueDay: 25,
    }];
    const bills: Bill[] = [
      { id: 'luz', createdAt: created, name: 'Luz', category: 'luz', amount: 45_000, recurrence: 'mensual', dueDay: 18 },
      { id: 'col', createdAt: created, name: 'Inscripción', category: 'colegiaturas', amount: 300_000, recurrence: 'unico', date: '2026-11-20' },
      { id: 'pag', createdAt: created, name: 'Pagado', category: 'agua', amount: 1, recurrence: 'unico', date: '2026-11-17', paidPeriods: ['2026-11'] },
    ];
    const items = dueItems(cards, bills, '2026-11-16');
    expect(items.map((i) => [i.name, i.date, i.daysLeft, i.semaforo, i.amount])).toEqual([
      ['Luz', '2026-11-18', 2, 'rojo', 45_000],
      ['Inscripción', '2026-11-20', 4, 'amarillo', 300_000],
      ['Oro •4321', '2026-11-25', 9, 'verde', 650_000],
    ]);
  });
});

describe('inversiones', () => {
  it('cripto: ganancia con precio en vivo', () => {
    const h = { id: 'b', createdAt: T0, coinId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', quantity: 0.01, buyPrice: 100_000_000, buyDate: '2026-01-01' };
    expect(valueCrypto(h, 1_200_000)).toEqual({ cost: 1_000_000, value: 1_200_000, gain: 200_000, gainPct: 0.2 });
    expect(valueCrypto(h, undefined)).toEqual({ cost: 1_000_000, value: null, gain: null, gainPct: null });
  });
  it('fondos: rendimiento', () => {
    const f = { id: 'f', createdAt: T0, name: 'F', institution: 'I', invested: 1_000_000, currentValue: 1_050_000, reportedYield: 10, date: '2026-11-01' };
    expect(fundGain(f)).toEqual({ gain: 50_000, gainPct: 0.05 });
  });
});
