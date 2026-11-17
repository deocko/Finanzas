import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildConfirmation, dedupeById, last4FromHint, mapCategory, maskAccountNumbers, matchAccount, merchantKey, parseIngest,
  sanitizeAccountHint, toInboxItems,
} from './ingest';
import type { Account, InboxItem } from './types';

const example = JSON.parse(readFileSync(fileURLToPath(new URL('../../docs/ejemplo-ingesta.json', import.meta.url)), 'utf8'));

const base = (expenses: unknown[]) => ({ version: 1, source: 'gmail', detected_at: '2026-11-17T10:00:00-06:00', expenses });
const good = {
  id: 'a1', date: '2026-11-16', merchant: 'Amazon México', description: 'Pedido', amount_cents: 74299,
  currency: 'MXN', type: 'compra', category_suggested: 'despensa',
};

const acc = (over: Partial<Account>): Account => ({
  id: 'x', createdAt: 0, name: 'Cuenta', kind: 'banco', initialBalance: 0, initialDate: '2026-01-01', ...over,
});

describe('validación del JSON de Byte', () => {
  it('acepta el archivo de ejemplo del repo (6 casos)', () => {
    const r = parseIngest(example);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.expenses).toHaveLength(6);
    expect(r.expenses.map((e) => e.type)).toEqual(['compra', 'compra', 'transferencia', 'retiro_efectivo', 'suscripcion', 'reembolso']);
    // "hogar" no existe en la app: se propone la más cercana y queda aviso
    expect(r.expenses[0]!.category).toBe('mantenimiento');
    expect(r.warnings.some((w) => w.index === 0 && w.field === 'category_suggested')).toBe(true);
  });

  it('acepta texto pegado', () => {
    expect(parseIngest(JSON.stringify(base([good]))).expenses).toHaveLength(1);
  });

  it('rechaza JSON roto, versión, origen y fecha de detección inválidos', () => {
    expect(parseIngest('{nope').ok).toBe(false);
    expect(parseIngest({ ...base([]), version: 2 }).errors[0]!.field).toBe('version');
    expect(parseIngest({ ...base([]), source: 'yahoo' }).errors[0]!.field).toBe('source');
    expect(parseIngest({ ...base([]), detected_at: 'ayer' }).errors[0]!.field).toBe('detected_at');
    expect(parseIngest({ ...base([]), expenses: 'x' }).errors[0]!.field).toBe('expenses');
    expect(parseIngest([]).ok).toBe(false);
  });

  it('rechaza gastos con campos inválidos sin tumbar los demás', () => {
    const r = parseIngest(base([
      good,
      { ...good, id: 'b', amount_cents: 742.99 },
      { ...good, id: 'c', amount_cents: -500 },
      { ...good, id: 'd', currency: 'USD' },
      { ...good, id: 'e', date: '2026-02-30' },
      { ...good, id: 'f', type: 'regalo' },
      { ...good, id: '' },
      { ...good, id: 'g', merchant: '   ' },
      { ...good, id: 'h', type: 'compra', direction: 'entrada' },
      'texto',
    ]));
    expect(r.ok).toBe(true);
    expect(r.expenses.map((e) => e.id)).toEqual(['a1']);
    const fields = r.errors.map((e) => `${e.index}:${e.field}`);
    expect(fields).toEqual(['1:amount_cents', '2:amount_cents', '3:currency', '4:date', '5:type', '6:id', '7:merchant', '8:direction', '9:(gasto)']);
  });

  it('detecta ids repetidos dentro del mismo archivo', () => {
    const r = parseIngest(base([good, { ...good }]));
    expect(r.expenses).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ index: 1, field: 'id' });
  });

  it('los reembolsos siempre son de entrada; las transferencias pueden ser de entrada', () => {
    const r = parseIngest(base([
      { ...good, id: 'r', type: 'reembolso' },
      { ...good, id: 't1', type: 'transferencia', direction: 'entrada' },
      { ...good, id: 't2', type: 'transferencia' },
    ]));
    expect(r.expenses.map((e) => e.direction)).toEqual(['entrada', 'entrada', 'salida']);
  });

  it('nunca deja pasar números completos de tarjeta o cuenta', () => {
    const r = parseIngest(base([{
      ...good,
      account_hint: 'tarjeta 4152 3138 0000 1234',
      description: 'Cargo a 4152-3138-0000-1234 y CLABE 012180000000000019',
      reference: 'RASTREO MBAN0100261116',
    }]));
    const e = r.expenses[0]!;
    expect(e.accountHint).toBe('tarjeta ****1234');
    expect(e.description).toBe('Cargo a ****1234 y CLABE ****0019');
    expect(e.reference).toBe('RASTREO MBAN0100261116');
    expect(`${e.accountHint} ${e.description}`).not.toMatch(/\d{5,}/);
    expect(r.warnings.filter((w) => w.field === 'account_hint' || w.field === 'description')).toHaveLength(2);
  });
});

describe('privacidad', () => {
  it('maskAccountNumbers respeta números de pedido con guiones', () => {
    expect(maskAccountNumbers('Pedido 702-2776683-7637868').masked).toBe(false);
    expect(maskAccountNumbers('Amex 3782 822463 10005').text).toBe('Amex ****0005');
    expect(maskAccountNumbers('cta 1234567890123').text).toBe('cta ****0123');
  });
  it('sanitizeAccountHint y last4FromHint', () => {
    expect(sanitizeAccountHint('tarjeta ****1234').hint).toBe('tarjeta ****1234');
    expect(sanitizeAccountHint('cuenta 0123456789').hint).toBe('cuenta ****6789');
    expect(last4FromHint('tarjeta ****1234')).toBe('1234');
    expect(last4FromHint('Mercado Pago')).toBeUndefined();
  });
});

describe('categorías', () => {
  it('usa las de la app o la más cercana', () => {
    expect(mapCategory('despensa')).toEqual({ category: 'despensa', exact: true });
    expect(mapCategory('Telefonía'.replace('í', 'i'))).toEqual({ category: 'telefonia', exact: true });
    expect(mapCategory('Hogar')).toEqual({ category: 'mantenimiento', exact: false });
    expect(mapCategory('streaming').category).toBe('ocio');
    expect(mapCategory('algo raro').category).toBe('otros');
    expect(mapCategory(undefined).category).toBe('otros');
  });
});

describe('deduplicación', () => {
  it('marca como duplicados los ids ya importados, en cualquier estado', () => {
    const r = dedupeById([{ id: 'a' }, { id: 'b' }, { id: 'c' }], ['b', 'z']);
    expect(r.nuevos.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r.duplicados.map((x) => x.id)).toEqual(['b']);
  });
  it('reimportar el mismo archivo no agrega nada', () => {
    const first = parseIngest(example).expenses;
    const known = first.map((e) => e.id);
    const again = dedupeById(parseIngest(example).expenses, known);
    expect(again.nuevos).toHaveLength(0);
    expect(again.duplicados).toHaveLength(6);
  });
});

describe('cuenta sugerida y reglas', () => {
  const accounts = [
    acc({ id: 'nom', name: 'Nómina', last4: '0193' }),
    acc({ id: 'mp', name: 'Mercado Pago', kind: 'mercado_pago' }),
    acc({ id: 'cash', name: 'Efectivo', kind: 'efectivo' }),
  ];
  it('empareja por últimos 4 dígitos o por Mercado Pago; si no, por asignar', () => {
    expect(matchAccount('tarjeta ****0193', accounts)).toBe('nom');
    expect(matchAccount('Mercado Pago', accounts)).toBe('mp');
    expect(matchAccount('tarjeta ****9999', accounts)).toBeUndefined();
    expect(matchAccount(undefined, accounts)).toBeUndefined();
  });
  it('merchantKey ignora país y mayúsculas', () => {
    expect(merchantKey('Amazon México')).toBe(merchantKey('AMAZON MX'));
  });
  it('las reglas por comercio solo aplican si están activadas', () => {
    const exp = parseIngest(example).expenses;
    const rules = [{ id: 'r', createdAt: 0, merchantKey: merchantKey('Netflix'), merchant: 'Netflix', category: 'telefonia' as const, autoConfirm: false }];
    const off = toInboxItems(exp, { importId: 'i', source: 'gmail', accounts, rules, rulesEnabled: false });
    const on = toInboxItems(exp, { importId: 'i', source: 'gmail', accounts, rules, rulesEnabled: true });
    expect(off[4]!.category).toBe('ocio');
    expect(on[4]!.category).toBe('telefonia');
    expect(off.every((i) => i.status === 'pendiente')).toBe(true);
  });
});

describe('confirmación', () => {
  const accounts = [acc({ id: 'nom', name: 'Nómina', last4: '0193' }), acc({ id: 'cash', name: 'Efectivo', kind: 'efectivo' })];
  const items = toInboxItems(parseIngest(example).expenses, { importId: 'i', source: 'gmail', accounts, rules: [], rulesEnabled: false })
    .map((x, k) => ({ ...x, id: `it${k}`, createdAt: 0 }) as InboxItem);

  it('compra → gasto en la cuenta, con ediciones de Diego', () => {
    const r = buildConfirmation(items[0]!, { category: 'otros', amount: 70000 }, accounts);
    expect(r.kind).toBe('expense');
    if (r.kind !== 'expense') return;
    expect(r.data).toMatchObject({ amount: 70000, category: 'otros', accountId: 'nom', method: 'debito', importItemId: 'it0', merchant: 'Amazon México' });
  });
  it('sin cuenta conocida queda por asignar', () => {
    const r = buildConfirmation(items[1]!, {}, accounts);
    expect(r.kind === 'expense' && r.data.accountId).toBe(undefined);
  });
  it('retiro de efectivo con cuenta de efectivo → movimiento entre cuentas', () => {
    const r = buildConfirmation(items[3]!, {}, accounts);
    expect(r).toMatchObject({ kind: 'transfer', data: { fromAccountId: 'nom', toAccountId: 'cash', amount: 200000 } });
  });
  it('reembolso → ingreso positivo', () => {
    const r = buildConfirmation(items[5]!, {}, accounts);
    expect(r).toMatchObject({ kind: 'income', data: { amount: 12000, type: 'otro', accountId: 'nom' } });
  });
  it('rechaza montos editados inválidos', () => {
    expect(() => buildConfirmation(items[0]!, { amount: 0 }, accounts)).toThrow();
  });
});
