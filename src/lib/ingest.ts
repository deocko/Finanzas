/**
 * Ingesta de gastos detectados por Byte en Gmail / Outlook.
 * Esquema documentado en docs/ingesta-correo.md (versión 1).
 *
 * La app NO lee correo: solo valida el JSON que entrega Byte, lo deduplica
 * y lo deja como «pendiente de confirmación». Nada se registra sin que Diego confirme.
 */
import type { Cents } from './money';
import type { ISODate } from './dates';
import { CATEGORIES } from './catalog';
import type { Account, Expense, ExpenseCategory, Income, InboxItem, IngestSource, IngestType, MerchantRule, PaymentMethod, Transfer } from './types';

export const INGEST_VERSION = 1;
export const INGEST_SOURCES: readonly IngestSource[] = ['gmail', 'outlook'];
export const INGEST_TYPES: readonly IngestType[] = ['compra', 'suscripcion', 'transferencia', 'retiro_efectivo', 'cargo_recurrente', 'reembolso'];

export const INGEST_TYPE_LABELS: Record<IngestType, string> = {
  compra: 'Compra',
  suscripcion: 'Suscripción',
  transferencia: 'Transferencia',
  retiro_efectivo: 'Retiro de efectivo',
  cargo_recurrente: 'Cargo recurrente',
  reembolso: 'Reembolso',
};

/** Un gasto tal como viene en el JSON de Byte, ya validado y limpio. */
export interface IngestExpense {
  id: string;
  date: ISODate;
  merchant: string;
  description: string;
  amount_cents: Cents;
  currency: 'MXN';
  type: IngestType;
  direction: 'salida' | 'entrada';
  category: ExpenseCategory;
  categoryRaw?: string;
  accountHint?: string;
  reference?: string;
  sourceMessage?: string;
}

export interface IngestIssue {
  /** Índice del gasto en `expenses` (o -1 si es del archivo). */
  index: number;
  field: string;
  message: string;
}

export interface IngestParseResult {
  ok: boolean;
  source?: IngestSource;
  detectedAt?: string;
  expenses: IngestExpense[];
  /** Errores: el gasto (o el archivo, si index = -1) no se importa. */
  errors: IngestIssue[];
  /** Avisos: el gasto sí se importa (p. ej. categoría ajustada o número enmascarado). */
  warnings: IngestIssue[];
}

/** Sinónimos frecuentes → categoría de la app (la más cercana). */
const CATEGORY_ALIASES: Record<string, ExpenseCategory> = {
  hogar: 'mantenimiento',
  casa: 'mantenimiento',
  supermercado: 'despensa',
  super: 'despensa',
  comida: 'despensa',
  alimentos: 'despensa',
  restaurante: 'ocio',
  restaurantes: 'ocio',
  entretenimiento: 'ocio',
  suscripcion: 'ocio',
  suscripciones: 'ocio',
  streaming: 'ocio',
  videojuegos: 'ocio',
  compras: 'otros',
  electronica: 'otros',
  ropa: 'otros',
  gasolina: 'transporte',
  auto: 'transporte',
  uber: 'transporte',
  internet: 'telefonia',
  celular: 'telefonia',
  telefono: 'telefonia',
  educacion: 'colegiaturas',
  escuela: 'colegiaturas',
  farmacia: 'salud',
  medico: 'salud',
  electricidad: 'luz',
  efectivo: 'otros',
  transferencia: 'otros',
};

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Normaliza una categoría sugerida a una de la app. `exact` indica si coincidió tal cual. */
export function mapCategory(raw: unknown): { category: ExpenseCategory; exact: boolean } {
  if (typeof raw !== 'string' || !raw.trim()) return { category: 'otros', exact: false };
  const k = fold(raw);
  if (k in CATEGORIES) return { category: k as ExpenseCategory, exact: true };
  const alias = CATEGORY_ALIASES[k];
  return { category: alias ?? 'otros', exact: false };
}

// ---------- Privacidad: nunca números completos de tarjeta o cuenta ----------

/**
 * Enmascara números de tarjeta o cuenta que aparezcan en texto libre:
 * - 4 grupos de 4 dígitos (o Amex 4-6-5) separados por espacio o guion,
 * - 12 a 19 dígitos seguidos (tarjeta, CLABE de 18) que no formen parte de un código alfanumérico.
 * Se conservan solo los últimos 4 dígitos: "****1234".
 */
export function maskAccountNumbers(text: string): { text: string; masked: boolean } {
  let masked = false;
  const last4 = (m: string) => {
    masked = true;
    const digits = m.replace(/\D/g, '');
    return `****${digits.slice(-4)}`;
  };
  const out = text
    .replace(/(?<![\dA-Za-z])\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}(?![\dA-Za-z])/g, last4)
    .replace(/(?<![\dA-Za-z])\d{4}[ -]\d{6}[ -]\d{5}(?![\dA-Za-z])/g, last4)
    .replace(/(?<![\dA-Za-z])\d{12,19}(?![\dA-Za-z])/g, last4);
  return { text: out, masked };
}

/**
 * Reduce `account_hint` a algo seguro: texto + "****1234".
 * Cualquier corrida de 5 o más dígitos se recorta a sus últimos 4.
 */
export function sanitizeAccountHint(hint: string): { hint: string; masked: boolean } {
  let masked = false;
  const out = hint.replace(/\d[\d -]*\d/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length <= 4) return m;
    masked = true;
    return `****${digits.slice(-4)}`;
  });
  return { hint: out.replace(/\*{5,}/g, '****').trim(), masked };
}

/** Últimos 4 dígitos que aparezcan en el hint, si hay. */
export function last4FromHint(hint: string | undefined): string | undefined {
  if (!hint) return undefined;
  const m = hint.match(/(\d{4})(?!.*\d)/);
  return m?.[1];
}

// ---------- Validación ----------

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/** Acepta un objeto ya parseado o el texto pegado. */
export function parseIngest(input: unknown): IngestParseResult {
  const errors: IngestIssue[] = [];
  const warnings: IngestIssue[] = [];
  const fail = (message: string, field = '(archivo)'): IngestParseResult => ({
    ok: false, expenses: [], errors: [{ index: -1, field, message }], warnings: [],
  });

  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return fail('El texto no es JSON válido.');
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Se esperaba un objeto con "version", "source", "detected_at" y "expenses".');
  const o = raw as Record<string, unknown>;

  if (o.version !== INGEST_VERSION) return fail(`Versión no soportada: se esperaba "version": ${INGEST_VERSION}.`, 'version');
  if (typeof o.source !== 'string' || !INGEST_SOURCES.includes(o.source as IngestSource)) {
    return fail('"source" debe ser "gmail" u "outlook".', 'source');
  }
  if (typeof o.detected_at !== 'string' || Number.isNaN(Date.parse(o.detected_at))) {
    return fail('"detected_at" debe ser una fecha y hora ISO 8601.', 'detected_at');
  }
  if (!Array.isArray(o.expenses)) return fail('"expenses" debe ser una lista.', 'expenses');
  if (o.expenses.length > 2000) return fail('Demasiados gastos en un solo archivo (máximo 2000).', 'expenses');

  const source = o.source as IngestSource;
  const expenses: IngestExpense[] = [];
  const seen = new Set<string>();

  o.expenses.forEach((item, index) => {
    const err = (field: string, message: string) => errors.push({ index, field, message });
    const warn = (field: string, message: string) => warnings.push({ index, field, message });
    if (!item || typeof item !== 'object' || Array.isArray(item)) return err('(gasto)', 'Cada gasto debe ser un objeto.');
    const e = item as Record<string, unknown>;
    const before = errors.length;

    const id = str(e.id, 200);
    if (!id) err('id', 'Falta "id" (texto estable y único por gasto).');
    else if (seen.has(id)) err('id', `"id" repetido dentro del mismo archivo: ${id}.`);

    const date = typeof e.date === 'string' ? e.date : '';
    if (!isRealDate(date)) err('date', '"date" debe ser una fecha real AAAA-MM-DD.');

    const merchantRaw = str(e.merchant, 120);
    if (!merchantRaw) err('merchant', 'Falta "merchant".');

    const amount = e.amount_cents;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) err('amount_cents', '"amount_cents" debe ser un entero (centavos).');
    else if (amount <= 0) err('amount_cents', '"amount_cents" debe ser mayor a cero (los reembolsos también van en positivo, con "type": "reembolso").');

    if (e.currency !== 'MXN') err('currency', '"currency" debe ser "MXN" (por ahora la app solo maneja pesos).');

    const type = e.type as IngestType;
    if (!INGEST_TYPES.includes(type)) err('type', `"type" debe ser uno de: ${INGEST_TYPES.join(', ')}.`);

    let direction: 'salida' | 'entrada' = 'salida';
    if (e.direction !== undefined) {
      if (e.direction !== 'salida' && e.direction !== 'entrada') err('direction', '"direction" (opcional) debe ser "salida" o "entrada".');
      else direction = e.direction;
    }
    if (type === 'reembolso') direction = 'entrada';
    else if (type !== 'transferencia' && direction === 'entrada') {
      err('direction', 'Solo "transferencia" y "reembolso" pueden ser de entrada.');
    }

    if (errors.length > before) return;

    const { category, exact } = mapCategory(e.category_suggested);
    if (!exact) {
      warn('category_suggested', e.category_suggested
        ? `Categoría "${String(e.category_suggested)}" no existe en la app; se propone "${CATEGORIES[category].label}" (editable).`
        : `Sin categoría sugerida; se propone "${CATEGORIES[category].label}" (editable).`);
    }

    let accountHint: string | undefined;
    const hintRaw = str(e.account_hint, 60);
    if (hintRaw) {
      const s = sanitizeAccountHint(hintRaw);
      accountHint = s.hint;
      if (s.masked) warn('account_hint', 'El "account_hint" traía más de 4 dígitos; se guardan solo los últimos 4.');
    }

    const clean = (field: string, v: string | undefined) => {
      if (!v) return undefined;
      const m = maskAccountNumbers(v);
      if (m.masked) warn(field, `"${field}" contenía un número de tarjeta o cuenta; se enmascaró a los últimos 4 dígitos.`);
      return m.text;
    };

    seen.add(id!);
    expenses.push({
      id: id!,
      date,
      merchant: clean('merchant', merchantRaw)!,
      description: clean('description', str(e.description, 240)) ?? '',
      amount_cents: amount as number,
      currency: 'MXN',
      type,
      direction,
      category,
      ...(exact ? {} : { categoryRaw: typeof e.category_suggested === 'string' ? e.category_suggested.slice(0, 40) : undefined }),
      ...(accountHint ? { accountHint } : {}),
      ...(str(e.reference, 120) ? { reference: clean('reference', str(e.reference, 120)) } : {}),
      ...(str(e.source_message, 200) ? { sourceMessage: str(e.source_message, 200) } : {}),
    });
  });

  return { ok: errors.filter((x) => x.index === -1).length === 0, source, detectedAt: o.detected_at, expenses, errors, warnings };
}

// ---------- Deduplicación ----------

export interface DedupeResult<T extends { id: string }> {
  nuevos: T[];
  duplicados: T[];
}

/** Separa los gastos cuyo `id` ya se importó antes (en cualquier estado: pendiente, confirmado o descartado). */
export function dedupeById<T extends { id: string }>(incoming: readonly T[], existingExtIds: Iterable<string>): DedupeResult<T> {
  const known = new Set(existingExtIds);
  const nuevos: T[] = [];
  const duplicados: T[] = [];
  for (const e of incoming) {
    if (known.has(e.id)) duplicados.push(e);
    else {
      known.add(e.id);
      nuevos.push(e);
    }
  }
  return { nuevos, duplicados };
}

// ---------- Cuenta sugerida y reglas por comercio ----------

export function merchantKey(merchant: string): string {
  return fold(merchant)
    .replace(/\b(mexico|mx|s\.?a\.?( de c\.?v\.?)?|inc|com)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Busca la cuenta que corresponde al hint: primero por últimos 4 dígitos, luego por tipo/nombre. */
export function matchAccount(hint: string | undefined, accounts: readonly Account[]): string | undefined {
  const l4 = last4FromHint(hint);
  if (l4) {
    const byDigits = accounts.filter((a) => a.last4 === l4);
    if (byDigits.length === 1) return byDigits[0]!.id;
  }
  const h = hint ? fold(hint) : '';
  if (h.includes('mercado pago')) {
    const mp = accounts.filter((a) => a.kind === 'mercado_pago');
    if (mp.length === 1) return mp[0]!.id;
  }
  if (h) {
    const byName = accounts.filter((a) => fold(a.name).length > 2 && h.includes(fold(a.name)));
    if (byName.length === 1) return byName[0]!.id;
  }
  // Si no hay coincidencia única, no se adivina: queda «por asignar».
  return undefined;
}

export type NewInboxItem = Omit<InboxItem, 'id' | 'createdAt'>;

/** Convierte gastos validados y nuevos en renglones pendientes, aplicando reglas si están activas. */
export function toInboxItems(
  expenses: readonly IngestExpense[],
  opts: { importId: string; source: IngestSource; accounts: readonly Account[]; rules: readonly MerchantRule[]; rulesEnabled: boolean },
): NewInboxItem[] {
  return expenses.map((e) => {
    const rule = opts.rulesEnabled ? opts.rules.find((r) => r.merchantKey === merchantKey(e.merchant)) : undefined;
    const accountId = matchAccount(e.accountHint, opts.accounts) ?? rule?.accountId;
    const item: NewInboxItem = {
      extId: e.id,
      importId: opts.importId,
      source: opts.source,
      date: e.date,
      merchant: e.merchant,
      description: e.description,
      amount: e.amount_cents,
      type: e.type,
      direction: e.direction,
      category: rule?.category ?? e.category,
      status: 'pendiente',
    };
    if (e.categoryRaw && !rule) item.categoryRaw = e.categoryRaw;
    if (accountId) item.accountId = accountId;
    if (e.accountHint) item.accountHint = e.accountHint;
    if (e.reference) item.reference = e.reference;
    if (e.sourceMessage) item.sourceMessage = e.sourceMessage;
    return item;
  });
}

// ---------- Confirmación ----------


export interface ConfirmEdits {
  category?: ExpenseCategory;
  amount?: Cents;
  accountId?: string | null;
}

export type ConfirmResult =
  | { kind: 'expense'; data: Omit<Expense, 'id' | 'createdAt'> }
  | { kind: 'income'; data: Omit<Income, 'id' | 'createdAt'> }
  | { kind: 'transfer'; data: Omit<Transfer, 'id' | 'createdAt'> };

function methodFor(type: IngestType, account: Account | undefined): PaymentMethod {
  if (type === 'transferencia') return 'transferencia';
  if (type === 'retiro_efectivo') return 'efectivo';
  switch (account?.kind) {
    case 'efectivo': return 'efectivo';
    case 'tarjeta_credito': return 'credito';
    case 'mercado_pago': return 'transferencia';
    default: return 'debito';
  }
}

/**
 * Qué se registra al confirmar un renglón (con las ediciones de Diego):
 * - salida → gasto (se descuenta de la cuenta; sin cuenta queda «por asignar»),
 * - entrada (reembolso / transferencia recibida) → ingreso «otro» en la cuenta,
 * - retiro de efectivo con cuenta de origen y una cuenta de efectivo → movimiento entre cuentas (no es gasto).
 */
export function buildConfirmation(item: InboxItem, edits: ConfirmEdits, accounts: readonly Account[]): ConfirmResult {
  const amount = edits.amount ?? item.amount;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('El monto debe ser mayor a cero.');
  const accountId = edits.accountId === null ? undefined : (edits.accountId ?? item.accountId);
  const account = accounts.find((a) => a.id === accountId);
  const concept = (item.description ? `${item.merchant} · ${item.description}` : item.merchant).slice(0, 120);

  if (item.direction === 'entrada') {
    return {
      kind: 'income',
      data: { date: item.date, concept, amount, type: 'otro', importItemId: item.id, ...(account ? { accountId: account.id } : {}) },
    };
  }
  const cash = accounts.filter((a) => a.kind === 'efectivo');
  if (item.type === 'retiro_efectivo' && account && account.kind !== 'efectivo' && cash.length === 1) {
    return {
      kind: 'transfer',
      data: { date: item.date, amount, fromAccountId: account.id, toAccountId: cash[0]!.id, concept: `Retiro de efectivo · ${item.merchant}`.slice(0, 120), importItemId: item.id },
    };
  }
  return {
    kind: 'expense',
    data: {
      date: item.date,
      concept,
      amount,
      category: edits.category ?? item.category,
      method: methodFor(item.type, account),
      merchant: item.merchant,
      importItemId: item.id,
      ...(account ? { accountId: account.id } : {}),
    },
  };
}
