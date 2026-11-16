import { describe, expect, it } from 'vitest';
import { centsToInput, formatMXN, mulCents, parseToCents, sumCents } from './money';

describe('parseToCents', () => {
  it.each([
    ['1234.56', 123456],
    ['1,234.56', 123456],
    ['$ 1,234', 123400],
    ['0.1', 10],
    ['.5', 50],
    ['10.005', 1001],
    ['10.004', 1000],
    ['0', 0],
    ['-25.5', -2550],
  ])('%s → %i', (input, cents) => {
    expect(parseToCents(input)).toBe(cents);
  });

  it.each(['', 'abc', '1.2.3', '.', '-', '12a'])('rechaza %j', (input) => {
    expect(parseToCents(input)).toBeNull();
  });
});

describe('sumas sin errores de flotante', () => {
  it('0.10 + 0.20 = 0.30 exactos', () => {
    expect(sumCents([parseToCents('0.10')!, parseToCents('0.20')!])).toBe(30);
  });
  it('mil cargos de $0.01 suman $10.00', () => {
    expect(sumCents(Array.from({ length: 1000 }, () => 1))).toBe(1000);
  });
});

describe('formato', () => {
  it('formatea MXN', () => {
    expect(formatMXN(123456)).toBe('$1,234.56');
    expect(formatMXN(0)).toBe('$0.00');
    expect(formatMXN(-5000)).toBe('-$50.00');
  });
  it('centsToInput ida y vuelta', () => {
    for (const c of [0, 1, 99, 100, 123456, -2550]) expect(parseToCents(centsToInput(c))).toBe(c);
  });
  it('mulCents redondea al centavo', () => {
    expect(mulCents(100, 0.125)).toBe(13);
    expect(mulCents(-100, 0.125)).toBe(-13);
  });
});
