/**
 * Dinero en CENTAVOS enteros. Nunca sumamos flotantes de pesos:
 * un error de un peso es un error grave.
 */
export type Cents = number;

const fmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtShort = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

/** $1,234.56 */
export function formatMXN(cents: Cents): string {
  // Evita "-$0.00"
  const v = cents === 0 ? 0 : cents / 100;
  return fmt.format(v);
}

/** $1,235 (sin centavos, para ejes de gráficas) */
export function formatMXNShort(cents: Cents): string {
  return fmtShort.format(Math.round(cents / 100));
}

/**
 * Convierte texto capturado ("1,234.5", "$ 1234", "1234.567") a centavos.
 * Regresa null si no es un número válido. Redondea a centavo (half-up).
 */
export function parseToCents(input: string): Cents | null {
  const clean = input.replace(/[\s$,]/g, '').trim();
  if (clean === '' || !/^-?\d*(\.\d*)?$/.test(clean) || clean === '.' || clean === '-') return null;
  const negative = clean.startsWith('-');
  const [intPart = '0', fracRaw = ''] = clean.replace('-', '').split('.');
  const frac = (fracRaw + '000').slice(0, 3);
  let cents = Number(intPart || '0') * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Centavos → texto editable "1234.50" */
export function centsToInput(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Multiplica centavos por un factor y redondea al centavo (half away from zero). */
export function mulCents(cents: Cents, factor: number): Cents {
  const raw = cents * factor;
  // corrige ruido binario (p. ej. 1.005 * 100) antes de redondear
  const fixed = Math.round(raw * 1e6) / 1e6;
  return Math.sign(fixed) * Math.round(Math.abs(fixed));
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}
