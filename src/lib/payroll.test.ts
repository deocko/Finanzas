import { describe, expect, it } from 'vitest';
import { calcularAguinaldo, calcularPrimaVacacional, diasVacacionesLFT, salarioDiarioDesdeMensual } from './payroll';

describe('salario diario', () => {
  it('mensual / 30', () => {
    expect(salarioDiarioDesdeMensual(1_500_000)).toBe(50_000); // $15,000 → $500
    expect(salarioDiarioDesdeMensual(1_000_000)).toBe(33_333); // $10,000 → $333.33
    expect(salarioDiarioDesdeMensual(1_000_010)).toBe(33_334); // $333.3366… → $333.34
  });
});

describe('aguinaldo (art. 87 LFT)', () => {
  it('15 días con salario diario de $500 = $7,500.00', () => {
    const r = calcularAguinaldo({ salarioDiario: 50_000, diasAguinaldo: 15 });
    expect(r.monto).toBe(750_000);
    expect(r.ajustadoAlMinimo).toBe(false);
  });
  it('días configurables: 30 días con $500 = $15,000.00', () => {
    expect(calcularAguinaldo({ salarioDiario: 50_000, diasAguinaldo: 30 }).monto).toBe(1_500_000);
  });
  it('menos de 15 días se ajusta al mínimo legal', () => {
    const r = calcularAguinaldo({ salarioDiario: 50_000, diasAguinaldo: 10 });
    expect(r.diasAplicados).toBe(15);
    expect(r.ajustadoAlMinimo).toBe(true);
    expect(r.monto).toBe(750_000);
  });
  it('proporcional: medio año (182.5 de 365) → mitad exacta', () => {
    expect(calcularAguinaldo({ salarioDiario: 50_000, diasAguinaldo: 15, diasTrabajados: 73 }).monto).toBe(150_000);
  });
  it('proporcional con centavos: $333.33 × 15 × 200/365 = $2,739.70', () => {
    // 33333 * 15 * 200 / 365 = 273,969.86… → 273,970 centavos
    expect(calcularAguinaldo({ salarioDiario: 33_333, diasAguinaldo: 15, diasTrabajados: 200 }).monto).toBe(273_970);
  });
  it('días trabajados se limitan al año', () => {
    expect(calcularAguinaldo({ salarioDiario: 50_000, diasAguinaldo: 15, diasTrabajados: 400 }).monto).toBe(750_000);
  });
});

describe('vacaciones (art. 76 LFT, reforma 2023)', () => {
  it.each([
    [0, 0], [1, 12], [2, 14], [3, 16], [4, 18], [5, 20],
    [6, 22], [10, 22], [11, 24], [15, 24], [16, 26], [21, 28], [26, 30], [31, 32],
  ])('%i años → %i días', (anios, dias) => {
    expect(diasVacacionesLFT(anios)).toBe(dias);
  });
});

describe('prima vacacional (art. 80 LFT)', () => {
  it('25 % de 12 días con $500 = $1,500.00', () => {
    const r = calcularPrimaVacacional({ salarioDiario: 50_000, diasVacaciones: 12 });
    expect(r.salarioVacaciones).toBe(600_000);
    expect(r.monto).toBe(150_000);
    expect(r.porcentajeAplicado).toBe(25);
  });
  it('porcentaje menor a 25 % se ajusta al mínimo', () => {
    expect(calcularPrimaVacacional({ salarioDiario: 50_000, diasVacaciones: 12, porcentaje: 10 }).monto).toBe(150_000);
  });
  it('porcentaje mayor (50 %) se respeta', () => {
    expect(calcularPrimaVacacional({ salarioDiario: 50_000, diasVacaciones: 12, porcentaje: 50 }).monto).toBe(300_000);
  });
  it('redondeo al centavo: $333.33 × 14 × 25 % = $1,166.66 (1,166.655 → .66)', () => {
    expect(calcularPrimaVacacional({ salarioDiario: 33_333, diasVacaciones: 14 }).monto).toBe(116_666);
  });
});
