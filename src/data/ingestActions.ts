/**
 * Acciones de la pantalla Importar. Escriben en el mismo almacén del MVP
 * (Firestore users/{uid}/… o localStorage en modo demo). Nunca guardan correos ni credenciales.
 */
import type { Account, InboxItem, MerchantRubro, MerchantRule, Recurring, Rubro } from '../lib/types';
import { RUBRO_NOMINA, classifyItems, learnMerchantRubro } from '../lib/rubros';
import { matchRecurring } from '../lib/recurring';
import type { HabitsData } from '../lib/health';
import { buildConfirmation, dedupeById, merchantKey, toInboxItems, type ConfirmEdits, type IngestParseResult } from '../lib/ingest';
import { possibleDuplicates, unusualCharge, chargeOfExpense, chargeOfInbox } from '../lib/alerts';
import type { Expense } from '../lib/types';
import type { DataStore } from './store';

export interface ImportOutcome {
  importId: string;
  nuevos: number;
  duplicados: number;
  invalidos: number;
  autoConfirmados: number;
}

export async function importParsed(
  store: DataStore,
  parsed: IngestParseResult,
  ctx: {
    inbox: readonly InboxItem[]; accounts: readonly Account[]; rules: MerchantRule[]; habits: HabitsData; expenses: readonly Expense[];
    /** Mensaje 4: catálogo, reglas comercio → rubro y recurrentes. Opcional para no romper lo anterior. */
    rubros?: readonly Rubro[]; merchantRubros?: MerchantRubro[]; recurrings?: readonly Recurring[];
  },
): Promise<ImportOutcome> {
  if (!parsed.ok || !parsed.source || !parsed.detectedAt) throw new Error('El archivo no es válido.');
  const { nuevos, duplicados } = dedupeById(parsed.expenses, ctx.inbox.map((i) => i.extId));
  const invalidos = new Set(parsed.errors.filter((e) => e.index >= 0).map((e) => e.index)).size;
  const importId = await store.add('imports', {
    date: Date.now(), source: parsed.source, detectedAt: parsed.detectedAt,
    total: parsed.expenses.length + invalidos, nuevos: nuevos.length, duplicados: duplicados.length, invalidos, autoConfirmados: 0,
  });
  let items = toInboxItems(nuevos, { importId, source: parsed.source, accounts: ctx.accounts, rules: ctx.rules, rulesEnabled: ctx.habits.merchantRulesEnabled });
  if (ctx.rubros?.length) {
    // Rubro sugerido por comercio, recurrente que coincide y «por clasificar» para lo desconocido.
    const keep = (m: string) => ctx.habits.merchantRulesEnabled && ctx.rules.some((r) => r.merchantKey === merchantKey(m));
    const c = classifyItems(items, { rubros: ctx.rubros, merchantRubros: ctx.merchantRubros ?? [], recurrings: ctx.recurrings ?? [], keepCategory: keep, matchRecurring });
    items = c.items;
    for (const m of c.newMerchants) {
      const id = await store.add('merchantRubros', m);
      ctx.merchantRubros?.push({ ...m, id, createdAt: Date.now() });
    }
    for (const r of c.newConcepts) await store.add('rubros', r);
  }
  let autoConfirmados = 0;
  const created: InboxItem[] = [];
  for (const it of items) {
    const id = await store.add('inbox', it);
    created.push({ ...it, id, createdAt: Date.now() });
  }
  // Auto-confirmación SOLO si Diego la encendió para ese comercio, y nunca si el cargo parece duplicado o inusual.
  if (ctx.habits.merchantRulesEnabled) {
    const history = [...ctx.expenses.map(chargeOfExpense).filter((c) => c !== null), ...created.map(chargeOfInbox)];
    const dupRefs = new Set(possibleDuplicates(history).flatMap(([a, b]) => [a.ref, b.ref]));
    for (const item of created) {
      const rule = ctx.rules.find((r) => r.merchantKey === merchantKey(item.merchant));
      if (!rule?.autoConfirm || item.direction !== 'salida') continue;
      const c = chargeOfInbox(item);
      if (dupRefs.has(c.ref) || unusualCharge(c, history).unusual) continue;
      await confirmItem(store, item, {}, { ...ctx, merchantRubros: undefined });
      autoConfirmados++;
    }
    if (autoConfirmados) await store.update('imports', importId, { autoConfirmados });
  }
  return { importId, nuevos: nuevos.length, duplicados: duplicados.length, invalidos, autoConfirmados };
}

export async function confirmItem(
  store: DataStore,
  item: InboxItem,
  edits: ConfirmEdits,
  /** `rules` (y `merchantRubros`) se actualizan en el lugar para que una confirmación en lote no cree reglas repetidas. */
  ctx: {
    accounts: readonly Account[]; rules: MerchantRule[]; habits: HabitsData;
    /** Mensaje 4: si se pasa, el rubro que Diego elija se guarda como regla del comercio. */
    merchantRubros?: MerchantRubro[]; recurrings?: readonly Recurring[];
  },
): Promise<{ kind: 'expense' | 'income' | 'transfer'; id: string } | undefined> {
  if (item.status !== 'pendiente') return undefined;
  const r = buildConfirmation(item, edits, ctx.accounts);
  const decidedAt = Date.now();
  const rubroId = edits.rubroId ?? item.rubroId;
  const recurring = ctx.recurrings?.find((x) => x.id === item.recurringId);
  const extra = { ...(rubroId ? { rubroId } : {}), ...(item.recurringId ? { recurringId: item.recurringId } : {}) };
  let out: { kind: 'expense' | 'income' | 'transfer'; id: string };
  if (r.kind === 'expense') {
    const expenseId = await store.add('expenses', { ...r.data, ...extra });
    await store.update('inbox', item.id, { status: 'confirmado', expenseId, decidedAt, category: r.data.category, amount: r.data.amount, accountId: r.data.accountId, ...(rubroId ? { rubroId } : {}) });
    out = { kind: 'expense', id: expenseId };
  } else if (r.kind === 'income') {
    // Depósito de nómina: se registra como sueldo (Mensaje 1) y queda ligado al ingreso quincenal.
    const isPayroll = (rubroId ?? recurring?.rubroId) === RUBRO_NOMINA;
    const data = { ...r.data, ...extra, ...(isPayroll ? { type: 'sueldo' as const } : {}) };
    const incomeId = await store.add('incomes', data);
    await store.update('inbox', item.id, { status: 'confirmado', incomeId, decidedAt, amount: r.data.amount, accountId: r.data.accountId, ...(rubroId ? { rubroId } : {}) });
    out = { kind: 'income', id: incomeId };
  } else {
    const transferId = await store.add('transfers', r.data);
    await store.update('inbox', item.id, { status: 'confirmado', transferId, decidedAt, amount: r.data.amount });
    out = { kind: 'transfer', id: transferId };
  }
  // Mensaje 4: si Diego eligió (o cambió) el rubro, se guarda como regla de ese comercio.
  if (ctx.merchantRubros && r.kind !== 'transfer') {
    const learn = learnMerchantRubro(item.merchant, rubroId, ctx.merchantRubros);
    if (learn?.update) {
      await store.update('merchantRubros', learn.update.id, { rubroId: learn.update.rubroId, origin: 'diego' });
      const m = ctx.merchantRubros.find((x) => x.id === learn.update!.id);
      if (m) Object.assign(m, { rubroId: learn.update.rubroId, origin: 'diego' });
    } else if (learn?.create) {
      const id = await store.add('merchantRubros', learn.create);
      ctx.merchantRubros.push({ ...learn.create, id, createdAt: Date.now() });
    }
  }
  // Reglas por comercio: aprende la categoría (y la cuenta) solo si Diego las activó.
  if (ctx.habits.merchantRulesEnabled && r.kind === 'expense') {
    const key = merchantKey(item.merchant);
    const rule = ctx.rules.find((x) => x.merchantKey === key);
    const data = { merchantKey: key, merchant: item.merchant, category: r.data.category, accountId: r.data.accountId, autoConfirm: rule?.autoConfirm ?? false };
    if (rule) {
      await store.update('merchantRules', rule.id, data);
      Object.assign(rule, data);
    } else {
      const id = await store.add('merchantRules', data);
      ctx.rules.push({ ...data, id, createdAt: Date.now() });
    }
  }
  return out;
}

export async function discardItem(store: DataStore, item: InboxItem): Promise<void> {
  if (item.status !== 'pendiente') return;
  await store.update('inbox', item.id, { status: 'descartado', decidedAt: Date.now() });
}
