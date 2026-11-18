/**
 * Alta inicial de Diego (Mensaje 4): cuentas, ingreso quincenal, cargos recurrentes y catálogo de rubros.
 *
 * - Ids fijos: aplicar dos veces no duplica nada.
 * - Solo se crea lo que falta; nunca se sobrescribe lo que Diego ya editó.
 * - Se aplica una sola vez por versión (colección `meta`): si Diego borra algo, no reaparece.
 * - NO trae saldos, límites, fechas de corte, fechas límite ni últimos 4 dígitos: todo eso queda «por confirmar».
 */
import type { ISODate } from './dates';
import type { Account, AccountKind, MerchantRubro, Recurring, Rubro } from './types';
import { BASE_MERCHANT_RUBROS, RUBRO_NOMINA, baseRubros } from './rubros';
import { merchantKey } from './ingest';

export const SETUP_VERSION = 1;
export const SETUP_META_ID = 'alta-inicial';

/** $25,900.00 MXN por quincena (dato de Diego). */
export const NOMINA_QUINCENAL = 2_590_000;

export interface SetupAccount {
  id: string;
  name: string;
  kind: AccountKind;
  institution?: string;
  note?: string;
}

/** Cuentas de Diego: nombre, tipo e institución. Sin saldos ni números. */
export const SETUP_ACCOUNTS: SetupAccount[] = [
  { id: 'acc-nomina-banamex', name: 'Nómina Banamex', kind: 'banco', institution: 'Banamex', note: 'Principal: ahí llega todo (nómina y depósitos)' },
  { id: 'acc-nomina-bancomer', name: 'Nómina Bancomer', kind: 'banco', institution: 'BBVA (Bancomer)', note: 'Segunda cuenta de nómina' },
  { id: 'acc-bbva-azul', name: 'BBVA Azul', kind: 'tarjeta_credito', institution: 'BBVA' },
  { id: 'acc-amex-green', name: 'Amex Green', kind: 'tarjeta_servicios', institution: 'American Express', note: 'Green Card: tarjeta de servicios, no es de crédito' },
  { id: 'acc-amex-business', name: 'Amex Business', kind: 'tarjeta', institution: 'American Express', note: 'Business Card (tipo por confirmar)' },
  { id: 'acc-amex-credit', name: 'Amex Credit Card', kind: 'tarjeta_credito', institution: 'American Express' },
  { id: 'acc-mercado-pago', name: 'Mercado Pago', kind: 'tarjeta_credito', institution: 'Mercado Pago' },
  { id: 'acc-plata-card', name: 'Plata Card', kind: 'tarjeta_credito', institution: 'Plata' },
  { id: 'acc-invex-walmart', name: 'Invex Walmart', kind: 'tarjeta_credito', institution: 'Invex / Walmart' },
  { id: 'acc-hipotecario-bbva', name: 'Hipotecario BBVA', kind: 'hipotecario', institution: 'BBVA', note: 'Préstamo, no tarjeta: saldo deudor por confirmar' },
];

export const SETUP_CASH: SetupAccount = { id: 'acc-efectivo', name: 'Efectivo', kind: 'efectivo' };

export type SetupRecurring = Omit<Recurring, 'createdAt'>;

/** Ingreso quincenal y cargos recurrentes. Montos y fechas de los cargos: por confirmar. */
export const SETUP_RECURRINGS: SetupRecurring[] = [
  {
    id: 'rec-nomina', name: 'Nómina', flow: 'ingreso', rubroId: RUBRO_NOMINA, frequency: 'quincenal',
    expectedAmount: NOMINA_QUINCENAL, amountConfirmed: true, days: [13, 28], daysConfirmed: false,
    accountId: 'acc-nomina-banamex', match: ['nomina', 'nómina', 'sueldo', 'pago de nomina'],
    note: 'Depósitos aproximados los días 13 y 28. Cada depósito se confirma contra lo que detecte Byte.',
  },
  { id: 'rec-spotify', name: 'Spotify', flow: 'cargo', rubroId: 'r-suscripciones-spotify', frequency: 'mensual', amountConfirmed: false, match: ['spotify'], note: 'Suscripción' },
  { id: 'rec-amazon-prime', name: 'Amazon Prime', flow: 'cargo', rubroId: 'r-suscripciones-prime', frequency: 'mensual_o_anual', amountConfirmed: false, match: ['amazon prime', 'prime video', 'prime'], note: 'Suscripción (mensual o anual por confirmar)' },
  { id: 'rec-netflix', name: 'Netflix', flow: 'cargo', rubroId: 'r-suscripciones-netflix', frequency: 'mensual', amountConfirmed: false, match: ['netflix'], note: 'Suscripción' },
  { id: 'rec-vix', name: 'ViX', flow: 'cargo', rubroId: 'r-suscripciones-vix', frequency: 'mensual', amountConfirmed: false, match: ['vix'], note: 'Suscripción' },
  { id: 'rec-hbo', name: 'HBO', flow: 'cargo', rubroId: 'r-suscripciones-hbo', frequency: 'mensual', amountConfirmed: false, match: ['hbo', 'hbo max'], note: 'Suscripción' },
  { id: 'rec-telcel', name: 'Telcel', flow: 'cargo', rubroId: 'r-servicios-telefonia', frequency: 'mensual', amountConfirmed: false, match: ['telcel'], note: 'Telefonía' },
  { id: 'rec-uber-eats', name: 'Uber Eats', flow: 'cargo', rubroId: 'r-alimentacion-uber-eats', frequency: 'variable', amountConfirmed: false, match: ['uber eats', 'ubereats'], note: 'Gasto recurrente variable (alimentación)' },
  { id: 'rec-mantenimiento', name: 'Mantenimiento', flow: 'cargo', rubroId: 'r-vivienda-mantenimiento', frequency: 'por_confirmar', amountConfirmed: false, match: ['mantenimiento'], note: 'Vivienda' },
  { id: 'rec-gas', name: 'Gas', flow: 'cargo', rubroId: 'r-vivienda-gas', frequency: 'por_confirmar', amountConfirmed: false, match: ['gas', 'gas lp', 'gas natural'], note: 'Vivienda / servicios' },
  { id: 'rec-ciudad-maderas', name: 'Terrenos Ciudad Maderas', flow: 'cargo', rubroId: 'r-vivienda-terrenos', frequency: 'por_confirmar', amountConfirmed: false, match: ['ciudad maderas'], note: 'Pago de terreno (vivienda)' },
  { id: 'rec-credito-nissan', name: 'Crédito Nissan', flow: 'cargo', rubroId: 'r-transporte-credito-auto', frequency: 'mensual', amountConfirmed: false, match: ['nissan'], note: 'Crédito automotriz' },
];

interface Existing {
  accounts: readonly Pick<Account, 'id' | 'kind'>[];
  rubros: readonly Pick<Rubro, 'id'>[];
  merchantRubros: readonly Pick<MerchantRubro, 'id' | 'merchantKey'>[];
  recurrings: readonly Pick<Recurring, 'id'>[];
}

export type SetupOp =
  | { col: 'accounts'; id: string; data: Omit<Account, 'id' | 'createdAt'> }
  | { col: 'rubros'; id: string; data: Omit<Rubro, 'id' | 'createdAt'> }
  | { col: 'merchantRubros'; id: string; data: Omit<MerchantRubro, 'id' | 'createdAt'> }
  | { col: 'recurrings'; id: string; data: Omit<Recurring, 'id' | 'createdAt'> };

/** Qué falta crear. Puro: no escribe nada. */
export function planSetup(existing: Existing, today: ISODate): SetupOp[] {
  const ops: SetupOp[] = [];
  const has = (xs: readonly { id: string }[], id: string) => xs.some((x) => x.id === id);

  const pendingAccount = (a: SetupAccount): Omit<Account, 'id' | 'createdAt'> => ({
    name: a.name, kind: a.kind, initialBalance: 0, initialDate: today, balancePending: true, setupKey: a.id,
    ...(a.institution ? { institution: a.institution } : {}),
    ...(a.note ? { note: a.note } : {}),
  });
  for (const a of SETUP_ACCOUNTS) if (!has(existing.accounts, a.id)) ops.push({ col: 'accounts', id: a.id, data: pendingAccount(a) });
  // Efectivo ya existe en el MVP: se conserva. Solo se crea si no hay ninguna cuenta de efectivo.
  if (!existing.accounts.some((a) => a.kind === 'efectivo')) ops.push({ col: 'accounts', id: SETUP_CASH.id, data: pendingAccount(SETUP_CASH) });

  for (const r of baseRubros()) {
    const { id, ...data } = r;
    if (!has(existing.rubros, id)) ops.push({ col: 'rubros', id, data });
  }
  for (const m of BASE_MERCHANT_RUBROS) {
    const key = merchantKey(m.merchant);
    const id = `mr-${key.replace(/\s+/g, '-')}`;
    if (!has(existing.merchantRubros, id) && !existing.merchantRubros.some((x) => x.merchantKey === key)) {
      ops.push({ col: 'merchantRubros', id, data: { merchantKey: key, merchant: m.merchant, rubroId: m.rubroId, origin: 'catalogo' } });
    }
  }
  for (const r of SETUP_RECURRINGS) {
    const { id, ...data } = r;
    if (!has(existing.recurrings, id)) ops.push({ col: 'recurrings', id, data: { ...data, setupKey: id } });
  }
  return ops;
}
