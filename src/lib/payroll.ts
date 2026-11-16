/**
 * Cálculos de prestaciones según la Ley Federal del Trabajo (México).
 * Todo en centavos enteros; se redondea UNA sola vez al final.
 */
import type { Cents } from './money';

/** Art. 87 LFT: aguinaldo mínimo de 15 días de salario. */
export const AGUINALDO_DIAS_MINIMOS = 15;
/** Art. 80 LFT: prima vacacional no menor al 25 %. */
export const PRIMA_VACACIONAL_MINIMA = 25;
/** Días que la LFT usa para convertir salario mensual a diario (práctica común). */
export const DIAS_MES = 30;

function roundHalfUp(x: number): number {
  const fixed = Math.round(x * 1e6) / 1e6;
  return Math.sign(fixed) * Math.round(Math.abs(fixed));
}

/** Salario diario = mensual / 30, redondeado al centavo. */
export function salarioDiarioDesdeMensual(mensual: Cents): Cents {
  return roundHalfUp(mensual / DIAS_MES);
}

export interface AguinaldoInput {
  salarioDiario: Cents;
  /** Días de aguinaldo que da la empresa. Si es menor a 15 se usa 15 (mínimo legal). */
  diasAguinaldo: number;
  /** Días trabajados en el año (para aguinaldo proporcional). Por defecto el año completo. */
  diasTrabajados?: number;
  /** Días del año (365 o 366). */
  diasAnio?: number;
}

export interface AguinaldoResult {
  monto: Cents;
  diasAplicados: number;
  proporcion: number;
  ajustadoAlMinimo: boolean;
}

export function calcularAguinaldo(input: AguinaldoInput): AguinaldoResult {
  const diasAnio = input.diasAnio ?? 365;
  const diasAplicados = Math.max(AGUINALDO_DIAS_MINIMOS, input.diasAguinaldo);
  const trabajados = Math.min(Math.max(0, input.diasTrabajados ?? diasAnio), diasAnio);
  const proporcion = trabajados / diasAnio;
  const monto = roundHalfUp((input.salarioDiario * diasAplicados * trabajados) / diasAnio);
  return {
    monto,
    diasAplicados,
    proporcion,
    ajustadoAlMinimo: input.diasAguinaldo < AGUINALDO_DIAS_MINIMOS,
  };
}

/**
 * Art. 76 LFT (reforma 2023, "vacaciones dignas"):
 * 1 año: 12 días, +2 por año hasta 20 (5.º año); a partir del 6.º, +2 cada 5 años.
 */
export function diasVacacionesLFT(aniosAntiguedad: number): number {
  const a = Math.floor(aniosAntiguedad);
  if (a < 1) return 0;
  if (a <= 5) return 12 + (a - 1) * 2;
  return 22 + Math.floor((a - 6) / 5) * 2;
}

export interface PrimaInput {
  salarioDiario: Cents;
  diasVacaciones: number;
  /** Porcentaje (25 = 25 %). Si es menor a 25 se usa 25. */
  porcentaje?: number;
}

export interface PrimaResult {
  monto: Cents;
  porcentajeAplicado: number;
  salarioVacaciones: Cents;
}

export function calcularPrimaVacacional(input: PrimaInput): PrimaResult {
  const porcentajeAplicado = Math.max(PRIMA_VACACIONAL_MINIMA, input.porcentaje ?? PRIMA_VACACIONAL_MINIMA);
  const salarioVacaciones = input.salarioDiario * Math.max(0, input.diasVacaciones);
  const monto = roundHalfUp((salarioVacaciones * porcentajeAplicado) / 100);
  return { monto, porcentajeAplicado, salarioVacaciones };
}
