/** Fechas como texto "YYYY-MM-DD" en hora local: sin sorpresas de zona horaria. */
export type ISODate = string;
/** Periodo mensual "YYYY-MM" */
export type Period = string;

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function parseISODate(s: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

/** Días entre dos fechas (b − a), exacto, sin horario de verano. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  const ua = Date.UTC(pa.y, pa.m - 1, pa.d);
  const ub = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ub - ua) / 86_400_000);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Fecha del día `day` en el mes dado; si el mes es corto se ajusta al último día (31 → 30/28). */
export function dateInMonth(y: number, m: number, day: number): ISODate {
  const d = Math.min(Math.max(1, day), daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function periodOf(date: ISODate): Period {
  return date.slice(0, 7);
}

export function addMonths(period: Period, n: number): Period {
  const [y = 1970, m = 1] = period.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function formatDate(date: ISODate): string {
  const { y, m, d } = parseISODate(date);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateShort(date: ISODate): string {
  const { m, d } = parseISODate(date);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatPeriod(period: Period, long = false): string {
  const [y = 1970, m = 1] = period.split('-').map(Number);
  return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}
