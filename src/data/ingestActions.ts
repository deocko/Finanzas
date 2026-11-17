/**
 * Acciones de la pantalla Importar. Escriben en el mismo almacén del MVP
 * (Firestore users/{uid}/… o localStorage en modo demo). Nunca guardan correos ni credenciales.
 */
import type { Account, InboxItem, MerchantRule } from '../lib/types';
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
  ctx: { inbox: readonly InboxItem[]; accounts: readonly Account[]; rules: MerchantRule[]; habits: HabitsData; expenses: readonly Expense[] },
): Promise<ImportOutcome> {
  if (!parsed.ok || !parsed.source || !parsed.detectedAt) throw new Error('El archivo no es válido.');
  const { nuevos, duplicados } = dedupeById(parsed.expenses, ctx.inbox.map((i) => i.extId));
  const invalidos = new Set(parsed.errors.filter((e) => e.index >= 0).map((e) => e.index)).size;
  const importId = await store.add('imports', {
    date: Date.now(), source: parsed.source, detectedAt: parsed.detectedAt,
    total: parsed.expenses.length + invalidos, nuevos: nuevos.length, duplicados: duplicados.length, invalidos, autoConfirmados: 0,
  });
  const items = toInboxItems(nuevos, { importId, source: parsed.source, accounts: ctx.accounts, rules: ctx.rules, rulesEnabled: ctx.habits.merchantRulesEnabled });
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
      await confirmItem(store, item, {}, ctx);
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
  /** `rules` se actualiza en el lugar para que una confirmación en lote no cree reglas repetidas. */
  ctx: { accounts: readonly Account[]; rules: MerchantRule[]; habits: HabitsData },
): Promise<void> {
  if (item.status !== 'pendiente') return;
  const r = buildConfirmation(item, edits, ctx.accounts);
  const decidedAt = Date.now();
  if (r.kind === 'expense') {
    const expenseId = await store.add('expenses', r.data);
    await store.update('inbox', item.id, { status: 'confirmado', expenseId, decidedAt, category: r.data.category, amount: r.data.amount, accountId: r.data.accountId });
  } else if (r.kind === 'income') {
    const incomeId = await store.add('incomes', r.data);
    await store.update('inbox', item.id, { status: 'confirmado', incomeId, decidedAt, amount: r.data.amount, accountId: r.data.accountId });
  } else {
    const transferId = await store.add('transfers', r.data);
    await store.update('inbox', item.id, { status: 'confirmado', transferId, decidedAt, amount: r.data.amount });
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
}

export async function discardItem(store: DataStore, item: InboxItem): Promise<void> {
  if (item.status !== 'pendiente') return;
  await store.update('inbox', item.id, { status: 'descartado', decidedAt: Date.now() });
}
