/**
 * DATOS DE EJEMPLO. No son datos reales de nadie.
 * Se generan relativos a la fecha de hoy para que la demo se vea viva.
 * Todos llevan `demo: true` y se pueden borrar desde Ajustes.
 */
import { addMonths, dateInMonth, parseISODate, periodOf, todayISO } from '../lib/dates';
import type { CollectionName } from '../lib/types';
import { SETTINGS_ID } from '../lib/types';
import type { LocalStore } from './localStore';
import type { NewDoc } from './store';

export async function seedDemo(store: LocalStore): Promise<void> {
  const today = todayISO();
  const current = periodOf(today);
  const { d: todayDay } = parseISODate(today);
  const add = <K extends CollectionName>(col: K, data: NewDoc<K>) => store.add(col, { ...data, demo: true });

  await store.set('settings', SETTINGS_ID, {
    salarioMensual: 2_400_000, diasAguinaldo: 15, aniosAntiguedad: 3, primaPorcentaje: 25, demo: true,
  });

  // 6 meses de movimientos
  for (let k = 5; k >= 0; k--) {
    const p = addMonths(current, -k);
    const [y = 2026, m = 1] = p.split('-').map(Number);
    const day = (d: number) => dateInMonth(y, m, d);
    const isCurrent = k === 0;
    const upTo = (d: number) => !isCurrent || d <= todayDay;
    const wiggle = (base: number, i: number) => base + ((k * 5 + i * 3) % 9) * 2_500;

    if (upTo(15)) await add('incomes', { date: day(15), concept: 'Sueldo 1.ª quincena (ejemplo)', amount: 1_200_000, type: 'sueldo' });
    if (upTo(30)) await add('incomes', { date: day(30), concept: 'Sueldo 2.ª quincena (ejemplo)', amount: 1_200_000, type: 'sueldo' });
    if (k === 3 && upTo(20)) await add('incomes', { date: day(20), concept: 'Venta de bicicleta (ejemplo)', amount: 350_000, type: 'otro' });

    const gastos: [number, string, NewDoc<'expenses'>['category'], number, NewDoc<'expenses'>['method'], string?][] = [
      [2, 'Colegiatura (ejemplo)', 'colegiaturas', 450_000, 'transferencia'],
      [4, 'Súper semanal (ejemplo)', 'despensa', wiggle(185_000, 1), 'debito', 'Supermercado'],
      [6, 'Recibo de luz (ejemplo)', 'luz', wiggle(62_000, 2), 'debito'],
      [8, 'Gasolina (ejemplo)', 'transporte', wiggle(90_000, 3), 'credito'],
      [10, 'Internet y celular (ejemplo)', 'telefonia', 79_900, 'credito'],
      [11, 'Súper semanal (ejemplo)', 'despensa', wiggle(162_000, 4), 'credito', 'Tienda de autoservicio'],
      [13, 'Gas LP (ejemplo)', 'gas', wiggle(48_000, 5), 'efectivo'],
      [16, 'Agua (ejemplo)', 'agua', 28_500, 'debito'],
      [18, 'Súper semanal (ejemplo)', 'despensa', wiggle(171_000, 6), 'debito', 'Supermercado'],
      [20, 'Cine y cena (ejemplo)', 'ocio', wiggle(95_000, 7), 'credito'],
      [22, 'Consulta médica (ejemplo)', 'salud', wiggle(70_000, 8), 'efectivo'],
      [25, 'Súper semanal (ejemplo)', 'despensa', wiggle(158_000, 9), 'debito', 'Mercado'],
      [27, 'Servicio del auto (ejemplo)', 'mantenimiento', k % 3 === 0 ? 260_000 : 0, 'credito'],
    ];
    for (const [d, concept, category, amount, method, store_] of gastos) {
      if (!amount || !upTo(d)) continue;
      await add('expenses', { date: day(d), concept, category, amount, method, ...(store_ ? { store: store_ } : {}) });
    }
  }

  await add('cards', {
    kind: 'credito', bank: 'Banco Ejemplo', alias: 'Clásica (ejemplo)', brand: 'visa', last4: '4821', holder: 'TITULAR DE EJEMPLO',
    color: '#0B2A5B', balance: 1_284_350, creditLimit: 4_500_000, cutDay: Math.max(1, ((todayDay + 18) % 28) || 28),
    dueDay: Math.max(1, ((todayDay + 5) % 28) || 28), minPayment: 64_200, noInterestPayment: 1_150_000,
  });
  await add('cards', {
    kind: 'credito', bank: 'Banco Demo', alias: 'Oro (ejemplo)', brand: 'mastercard', last4: '7710', holder: 'TITULAR DE EJEMPLO',
    color: '#B91C1C', balance: 356_000, creditLimit: 2_000_000, cutDay: Math.max(1, ((todayDay + 8) % 28) || 28),
    dueDay: Math.max(1, ((todayDay + 2) % 28) || 28), minPayment: 17_800, noInterestPayment: 356_000,
  });
  await add('cards', {
    kind: 'debito', bank: 'Banco Ejemplo', alias: 'Nómina (ejemplo)', brand: 'visa', last4: '0193', holder: 'TITULAR DE EJEMPLO',
    color: '#047857', balance: 1_875_420,
  });

  await add('bills', { name: 'Colegiatura (ejemplo)', category: 'colegiaturas', amount: 450_000, recurrence: 'mensual', dueDay: Math.max(1, ((todayDay + 12) % 28) || 28) });
  await add('bills', { name: 'Luz (ejemplo)', category: 'luz', amount: 62_000, recurrence: 'mensual', dueDay: Math.max(1, ((todayDay + 6) % 28) || 28) });
  await add('bills', { name: 'Internet y celular (ejemplo)', category: 'telefonia', amount: 79_900, recurrence: 'mensual', dueDay: Math.max(1, ((todayDay + 20) % 28) || 28) });
  await add('bills', { name: 'Agua (ejemplo)', category: 'agua', amount: 28_500, recurrence: 'mensual', dueDay: Math.max(1, ((todayDay + 1) % 28) || 28) });

  await add('crypto', { coinId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', quantity: 0.015, buyPrice: 150_000_000, buyDate: dateInMonth(...ym(addMonths(current, -8)), 10) });
  await add('crypto', { coinId: 'ethereum', symbol: 'ETH', name: 'Ethereum', quantity: 0.4, buyPrice: 6_500_000, buyDate: dateInMonth(...ym(addMonths(current, -4)), 3) });

  await add('funds', { name: 'Fondo de deuda (ejemplo)', institution: 'Operadora Ejemplo', invested: 5_000_000, currentValue: 5_312_000, reportedYield: 10.2, date: dateInMonth(...ym(current), 1) });
  await add('funds', { name: 'Fondo de renta variable (ejemplo)', institution: 'Operadora Demo', invested: 2_000_000, currentValue: 1_946_000, reportedYield: -2.7, date: dateInMonth(...ym(current), 1) });

  // Cuentas de ejemplo (saldo inicial al día 1 del mes). "0193" coincide con docs/ejemplo-ingesta.json.
  await add('accounts', { name: 'Nómina (ejemplo)', kind: 'banco', last4: '0193', initialBalance: 1_875_420, initialDate: dateInMonth(...ym(current), 1), lowBalanceThreshold: 300_000 });
  await add('accounts', { name: 'Efectivo (ejemplo)', kind: 'efectivo', initialBalance: 80_000, initialDate: dateInMonth(...ym(current), 1) });
  await add('accounts', { name: 'Mercado Pago (ejemplo)', kind: 'mercado_pago', initialBalance: 120_000, initialDate: dateInMonth(...ym(current), 1) });

  store.markSeeded();
}

function ym(p: string): [number, number] {
  const [y = 2026, m = 1] = p.split('-').map(Number);
  return [y, m];
}
