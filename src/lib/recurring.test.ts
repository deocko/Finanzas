import { describe, expect, it } from 'vitest';
import { chargeInfo, estimatedDates, matchRecurring, paydays, recurringMatches } from './recurring';
import { NOMINA_QUINCENAL, SETUP_RECURRINGS } from './setup';
import type { Expense, InboxItem, Income, Recurring } from './types';

const recs: Recurring[] = SETUP_RECURRINGS.map((r) => ({ ...r, createdAt: 0 }));
const nomina = recs.find((r) => r.id === 'rec-nomina')!;
const spotify = recs.find((r) => r.id === 'rec-spotify')!;

const inboxItem = (over: Partial<InboxItem>): InboxItem => ({
  id: 'i', createdAt: 0, extId: 'e', importId: 'imp', source: 'gmail', date: '2026-11-13', merchant: 'Banamex', description: 'Depósito de nómina',
  amount: NOMINA_QUINCENAL, type: 'transferencia', direction: 'entrada', category: 'otros', status: 'pendiente', recurringId: 'rec-nomina', ...over,
});
const income = (over: Partial<Income>): Income => ({
  id: 'inc', createdAt: 0, date: '2026-10-13', concept: 'Nómina', amount: NOMINA_QUINCENAL, type: 'sueldo', recurringId: 'rec-nomina', ...over,
});

describe('ingreso quincenal «Nómina»', () => {
  it('está configurado: $25,900.00 cada quincena, días 13 y 28, en Nómina Banamex', () => {
    expect(nomina).toMatchObject({ expectedAmount: 2_590_000, amountConfirmed: true, frequency: 'quincenal', days: [13, 28], accountId: 'acc-nomina-banamex' });
    expect(Number.isSafeInteger(nomina.expectedAmount)).toBe(true);
  });

  it('fechas estimadas del mes (en febrero el 28 existe)', () => {
    expect(estimatedDates(nomina, '2026-11')).toEqual(['2026-11-13', '2026-11-28']);
    expect(estimatedDates(nomina, '2027-02')).toEqual(['2027-02-13', '2027-02-28']);
  });

  it('llegar la fecha estimada NO marca el depósito como recibido', () => {
    const p = paydays(nomina, '2026-11', '2026-11-20', { incomes: [], inbox: [] });
    expect(p.map((x) => x.status)).toEqual(['sin_detectar', 'esperado']);
    expect(p.every((x) => x.amount === undefined)).toBe(true);
  });

  it('detectado por Byte con el monto esperado → «detectado, por confirmar»', () => {
    const p = paydays(nomina, '2026-11', '2026-11-20', { incomes: [], inbox: [inboxItem({ id: 'a', date: '2026-11-12' })] });
    expect(p[0]).toMatchObject({ status: 'detectado', amount: NOMINA_QUINCENAL, diff: 0, inboxId: 'a' });
  });

  it('detectado por otro monto → diferencia por confirmar (con la diferencia en centavos)', () => {
    const p = paydays(nomina, '2026-11', '2026-11-30', { incomes: [], inbox: [inboxItem({ id: 'b', date: '2026-11-27', amount: 2_545_050 })] });
    expect(p[1]).toMatchObject({ status: 'diferencia', amount: 2_545_050, diff: -44_950 });
    expect(p[0]!.status).toBe('sin_detectar');
  });

  it('confirmado por Diego → recibido; con monto distinto → recibido con diferencia', () => {
    const data = { incomes: [income({ id: 'x', date: '2026-10-13' }), income({ id: 'y', date: '2026-10-29', amount: 2_600_000 })], inbox: [] };
    const p = paydays(nomina, '2026-10', '2026-11-17', data);
    expect(p[0]).toMatchObject({ status: 'recibido', incomeId: 'x' });
    expect(p[1]).toMatchObject({ status: 'recibido_diferencia', diff: 10_000 });
  });

  it('cada depósito cuenta para una sola quincena y fuera de ±5 días no cuenta', () => {
    const one = paydays(nomina, '2026-11', '2026-11-30', { incomes: [], inbox: [inboxItem({ id: 'c', date: '2026-11-20' })] });
    // El 20 está a 7 días del 13 y a 8 del 28: no se asigna a ninguna
    expect(one.map((x) => x.status)).toEqual(['sin_detectar', 'sin_detectar']);
    const two = paydays(nomina, '2026-11', '2026-11-30', { incomes: [], inbox: [inboxItem({ id: 'd', date: '2026-11-14' }), inboxItem({ id: 'e', date: '2026-11-15' })] });
    expect(two[0]!.inboxId).toBe('d');
    expect(two[1]!.status).toBe('sin_detectar');
  });

  it('pendientes descartados o de otro recurrente no cuentan', () => {
    const p = paydays(nomina, '2026-11', '2026-11-30', {
      incomes: [],
      inbox: [inboxItem({ id: 'f', status: 'descartado' }), inboxItem({ id: 'g', recurringId: 'otro' })],
    });
    expect(p[0]!.status).toBe('sin_detectar');
  });
});

describe('reconocer recurrentes en lo que detecta Byte', () => {
  it('por palabra completa y en la dirección correcta', () => {
    expect(recurringMatches({ merchant: 'BANAMEX', description: 'PAGO DE NOMINA', direction: 'entrada' }, nomina)).toBe(true);
    expect(recurringMatches({ merchant: 'BANAMEX', description: 'PAGO DE NOMINA', direction: 'salida' }, nomina)).toBe(false);
    expect(matchRecurring({ merchant: 'UBER EATS', description: '', direction: 'salida' }, recs)?.id).toBe('rec-uber-eats');
    expect(matchRecurring({ merchant: 'Gasolinera Pemex', description: '', direction: 'salida' }, recs)).toBeUndefined();
    expect(matchRecurring({ merchant: 'Gas Natural', description: '', direction: 'salida' }, recs)?.id).toBe('rec-gas');
  });
});

describe('cargos recurrentes', () => {
  it('ninguno trae monto ni fecha inventados', () => {
    for (const r of recs.filter((x) => x.flow === 'cargo')) {
      expect(r.expectedAmount).toBeUndefined();
      expect(r.amountConfirmed).toBe(false);
      expect(r.days).toBeUndefined();
    }
    expect(recs.filter((x) => x.flow === 'cargo').map((x) => x.name)).toEqual([
      'Spotify', 'Amazon Prime', 'Netflix', 'ViX', 'HBO', 'Telcel', 'Uber Eats', 'Mantenimiento', 'Gas', 'Terrenos Ciudad Maderas', 'Crédito Nissan',
    ]);
  });

  it('estado: por confirmar → monto por confirmar (detectado) → confirmado, con diferencia', () => {
    expect(chargeInfo(spotify, { expenses: [], inbox: [] }).status).toBe('por_confirmar');
    const pend = inboxItem({ id: 'p', merchant: 'Spotify', direction: 'salida', type: 'suscripcion', amount: 11_900, recurringId: 'rec-spotify', date: '2026-11-05' });
    const i1 = chargeInfo(spotify, { expenses: [], inbox: [pend] });
    expect(i1).toMatchObject({ status: 'monto_por_confirmar', lastPending: { amount: 11_900 } });
    const exp: Expense = { id: 'e', createdAt: 0, date: '2026-12-05', concept: 'Spotify', amount: 12_900, category: 'ocio', method: 'credito', recurringId: 'rec-spotify' };
    const i2 = chargeInfo({ ...spotify, expectedAmount: 11_900, amountConfirmed: true }, { expenses: [exp], inbox: [pend] });
    expect(i2).toMatchObject({ status: 'confirmado', diff: 1_000 });
  });
});
