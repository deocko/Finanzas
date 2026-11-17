/**
 * Flujo completo contra el almacén de la demo (en memoria): alta inicial → importar → deduplicar →
 * clasificar por rubro → confirmar nómina y cargo → regla por comercio.
 */
import { describe, expect, it } from 'vitest';
import { LocalStore } from './localStore';
import { confirmItem, importParsed } from './ingestActions';
import { parseIngest } from '../lib/ingest';
import { planSetup } from '../lib/setup';
import { paydays } from '../lib/recurring';
import { accountSummary } from '../lib/accounts';
import { DEFAULT_HABITS } from '../lib/health';
import { RUBRO_NOMINA, RUBRO_POR_CLASIFICAR } from '../lib/rubros';
import type { CollectionMap, CollectionName } from '../lib/types';

async function snapshot<K extends CollectionName>(store: LocalStore, col: K): Promise<CollectionMap[K][]> {
  return new Promise((res) => {
    const off = store.subscribe(col, (items) => {
      res(items);
      queueMicrotask(() => off());
    });
  });
}

const file = (expenses: unknown[]) => ({ version: 1, source: 'gmail', detected_at: '2026-11-17T10:00:00-06:00', expenses });
const nominaDep = { id: 'dep-13', date: '2026-11-13', merchant: 'Banamex', description: 'Pago de nómina (EJEMPLO)', amount_cents: 2_590_000, currency: 'MXN', type: 'transferencia', direction: 'entrada', account_hint: 'cuenta ****0000' };
const nominaDif = { ...nominaDep, id: 'dep-28', date: '2026-11-27', amount_cents: 2_545_050 };
const spotify = { id: 'sp-1', date: '2026-11-05', merchant: 'SPOTIFY MEXICO', amount_cents: 11_900, currency: 'MXN', type: 'suscripcion' };
const nuevo = { id: 'nv-1', date: '2026-11-06', merchant: 'Ferretería La Tuerca (EJEMPLO)', amount_cents: 35_000, currency: 'MXN', type: 'compra', category_suggested: 'mascotas' };

async function setup() {
  const store = new LocalStore();
  for (const op of planSetup({ accounts: [], rubros: [], merchantRubros: [], recurrings: [] }, '2026-11-01')) await store.set(op.col, op.id, op.data as never);
  const ctx = async () => ({
    inbox: await snapshot(store, 'inbox'), accounts: await snapshot(store, 'accounts'), rules: [] as never[], habits: DEFAULT_HABITS,
    expenses: await snapshot(store, 'expenses'), rubros: await snapshot(store, 'rubros'),
    merchantRubros: await snapshot(store, 'merchantRubros'), recurrings: await snapshot(store, 'recurrings'),
  });
  return { store, ctx };
}

describe('ingesta con rubros y recurrentes', () => {
  it('deduplica al reimportar y no duplica comercios por clasificar', async () => {
    const { store, ctx } = await setup();
    const parsed = parseIngest(file([nominaDep, spotify, nuevo]));
    const r1 = await importParsed(store, parsed, await ctx());
    expect(r1).toMatchObject({ nuevos: 3, duplicados: 0 });
    const r2 = await importParsed(store, parsed, await ctx());
    expect(r2).toMatchObject({ nuevos: 0, duplicados: 3 });
    expect(await snapshot(store, 'inbox')).toHaveLength(3);
    const nuevos = (await snapshot(store, 'merchantRubros')).filter((m) => m.origin === 'nuevo');
    expect(nuevos.map((m) => m.merchant)).toEqual(['Ferretería La Tuerca (EJEMPLO)']);
    expect((await snapshot(store, 'rubros')).filter((r) => r.porClasificar).map((r) => r.name)).toEqual(['mascotas']);
  });

  it('todo queda pendiente con rubro sugerido; cuenta sin coincidencia → por asignar', async () => {
    const { store, ctx } = await setup();
    await importParsed(store, parseIngest(file([nominaDep, spotify, nuevo])), await ctx());
    const inbox = await snapshot(store, 'inbox');
    expect(inbox.every((i) => i.status === 'pendiente')).toBe(true);
    const by = (id: string) => inbox.find((i) => i.extId === id)!;
    expect(by('dep-13')).toMatchObject({ rubroId: RUBRO_NOMINA, recurringId: 'rec-nomina' });
    expect(by('dep-13').accountId).toBeUndefined(); // ****0000 no coincide con ninguna cuenta
    expect(by('sp-1')).toMatchObject({ rubroId: 'r-suscripciones-spotify', recurringId: 'rec-spotify', category: 'ocio' });
    expect(by('nv-1').rubroId).toBe(RUBRO_POR_CLASIFICAR);
    expect(await snapshot(store, 'incomes')).toHaveLength(0);
    expect(await snapshot(store, 'expenses')).toHaveLength(0);
  });

  it('confirmar la nómina: sueldo ligado al recurrente; la diferencia queda por confirmar', async () => {
    const { store, ctx } = await setup();
    await importParsed(store, parseIngest(file([nominaDep, nominaDif])), await ctx());
    const c = await ctx();
    const dep = c.inbox.find((i) => i.extId === 'dep-13')!;
    await confirmItem(store, dep, { accountId: 'acc-nomina-banamex' }, { ...c, rules: [] });
    const incomes = await snapshot(store, 'incomes');
    expect(incomes).toHaveLength(1);
    expect(incomes[0]).toMatchObject({ type: 'sueldo', amount: 2_590_000, recurringId: 'rec-nomina', rubroId: RUBRO_NOMINA, accountId: 'acc-nomina-banamex' });

    const nomina = c.recurrings.find((r) => r.id === 'rec-nomina')!;
    const p = paydays(nomina, '2026-11', '2026-11-30', { incomes, inbox: await snapshot(store, 'inbox') });
    expect(p.map((x) => x.status)).toEqual(['recibido', 'diferencia']);
    expect(p[1]!.diff).toBe(-44_950);

    // Saldo de la cuenta: inicial por confirmar → null, pero el neto confirmado sí se ve
    const acc = (await snapshot(store, 'accounts')).find((a) => a.id === 'acc-nomina-banamex')!;
    const s = accountSummary(acc, [], incomes, [], await snapshot(store, 'inbox'));
    expect(s.confirmed).toBeNull();
    expect(s.netConfirmed).toBe(2_590_000);
  });

  it('si Diego cambia el rubro al confirmar, queda como regla para los siguientes', async () => {
    const { store, ctx } = await setup();
    await importParsed(store, parseIngest(file([nuevo])), await ctx());
    const c = await ctx();
    await confirmItem(store, c.inbox[0]!, { rubroId: 'r-compras-hogar' }, { ...c, rules: [] });
    const exp = await snapshot(store, 'expenses');
    expect(exp[0]).toMatchObject({ rubroId: 'r-compras-hogar' });
    const rule = (await snapshot(store, 'merchantRubros')).find((m) => m.merchantKey === 'ferreteria la tuerca ejemplo')!;
    expect(rule).toMatchObject({ rubroId: 'r-compras-hogar', origin: 'diego' });

    // El siguiente gasto del mismo comercio llega con ese rubro sugerido (y sigue pendiente)
    await importParsed(store, parseIngest(file([{ ...nuevo, id: 'nv-2', date: '2026-11-20' }])), await ctx());
    const next = (await snapshot(store, 'inbox')).find((i) => i.extId === 'nv-2')!;
    expect(next).toMatchObject({ rubroId: 'r-compras-hogar', status: 'pendiente', category: 'mantenimiento' });
  });
});
