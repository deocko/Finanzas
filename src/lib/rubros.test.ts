import { describe, expect, it } from 'vitest';
import {
  RUBRO_NOMINA, RUBRO_POR_CLASIFICAR, baseRubros, categoryOfRubro, classifyItems, findMerchantRubro, learnMerchantRubro,
  rubroLabel, rubroTree, suggestRubro,
} from './rubros';
import { matchRecurring } from './recurring';
import { SETUP_RECURRINGS } from './setup';
import { merchantKey } from './ingest';
import type { InboxItem, MerchantRubro, Recurring, Rubro } from './types';

const rubros: Rubro[] = baseRubros().map((r) => ({ ...r, createdAt: 0 }));
const rule = (merchant: string, rubroId: string, origin: MerchantRubro['origin'] = 'catalogo'): MerchantRubro => ({
  id: `mr-${merchantKey(merchant)}`, createdAt: 0, merchant, merchantKey: merchantKey(merchant), rubroId, origin,
});
const rules: MerchantRubro[] = [
  rule('Spotify', 'r-suscripciones-spotify'),
  rule('Uber', 'r-transporte-uber-didi'),
  rule('Uber Eats', 'r-alimentacion-uber-eats'),
  rule('Amazon', 'r-compras-amazon'),
  rule('Amazon Prime', 'r-suscripciones-prime'),
  rule('Telcel', 'r-servicios-telefonia'),
];
const recurrings: Recurring[] = SETUP_RECURRINGS.map((r) => ({ ...r, createdAt: 0 }));

type Item = Pick<InboxItem, 'merchant' | 'description' | 'direction' | 'type' | 'category' | 'categoryRaw' | 'date' | 'amount'> & { rubroId?: string; recurringId?: string };
const item = (over: Partial<Item>): Item => ({
  merchant: 'X', description: '', direction: 'salida', type: 'compra', category: 'otros', date: '2026-11-13', amount: 10000, ...over,
});

describe('catálogo de rubros', () => {
  it('trae los 10 rubros principales pedidos, con sus subrubros', () => {
    const tree = rubroTree(rubros);
    expect(tree.map((t) => t.group.name)).toEqual([
      'Ingresos', 'Vivienda', 'Transporte', 'Servicios', 'Suscripciones y entretenimiento', 'Alimentación', 'Compras', 'Salud', 'Tarjetas y créditos', 'Otros / por clasificar',
    ]);
    expect(tree[0]!.children.map((c) => c.name)).toEqual(['Nómina', 'Aguinaldo', 'Prima vacacional', 'Reembolsos', 'Otros ingresos']);
    expect(tree[1]!.children.map((c) => c.name)).toContain('Terrenos (Ciudad Maderas)');
    // ids únicos
    expect(new Set(rubros.map((r) => r.id)).size).toBe(rubros.length);
  });

  it('cada subrubro de gasto se registra con una categoría del MVP', () => {
    for (const r of rubros.filter((x) => x.flow === 'gasto' && x.parentId)) expect(categoryOfRubro(rubros, r.id)).toBeTruthy();
    expect(categoryOfRubro(rubros, 'r-vivienda-gas')).toBe('gas');
    expect(categoryOfRubro(rubros, 'r-servicios-telefonia')).toBe('telefonia');
    expect(rubroLabel(rubros, 'r-suscripciones-netflix')).toBe('Suscripciones y entretenimiento › Netflix');
  });
});

describe('clasificación por comercio', () => {
  it('coincide por palabra completa y gana la regla más específica', () => {
    expect(findMerchantRubro('SPOTIFY MEXICO', rules)?.rubroId).toBe('r-suscripciones-spotify');
    expect(findMerchantRubro('UBER EATS', rules)?.rubroId).toBe('r-alimentacion-uber-eats');
    expect(findMerchantRubro('Uber BV', rules)?.rubroId).toBe('r-transporte-uber-didi');
    expect(findMerchantRubro('Amazon Prime', rules)?.rubroId).toBe('r-suscripciones-prime');
    expect(findMerchantRubro('Amazon México', rules)?.rubroId).toBe('r-compras-amazon');
    // «Uberrimo» no es Uber
    expect(findMerchantRubro('Uberrimo Café', rules)).toBeUndefined();
  });

  it('la preferencia de Diego gana sobre el catálogo', () => {
    const withPref = [...rules, rule('Spotify Family', 'r-compras-electronica', 'diego')];
    expect(findMerchantRubro('Spotify Family', withPref)?.rubroId).toBe('r-compras-electronica');
  });

  it('comercio desconocido → por clasificar (nunca se inventa rubro)', () => {
    expect(suggestRubro(item({ merchant: 'Tienda Desconocida' }), { rubros, merchantRubros: rules })).toEqual({ rubroId: RUBRO_POR_CLASIFICAR, via: 'por_clasificar' });
  });

  it('reembolso sin regla → Ingresos › Reembolsos; depósito de nómina → Nómina', () => {
    expect(suggestRubro(item({ merchant: 'Liverpool', type: 'reembolso', direction: 'entrada' }), { rubros, merchantRubros: rules }).rubroId).toBe('r-ingresos-reembolsos');
    const dep = item({ merchant: 'Banamex', description: 'Depósito de nómina', type: 'transferencia', direction: 'entrada' });
    const rec = matchRecurring(dep, recurrings);
    expect(rec?.id).toBe('rec-nomina');
    expect(suggestRubro(dep, { rubros, merchantRubros: rules, recurring: rec }).rubroId).toBe(RUBRO_NOMINA);
  });

  it('classifyItems: rubro y categoría sugeridos; desconocidos se agregan una sola vez como por clasificar', () => {
    const r = classifyItems(
      [
        item({ merchant: 'SPOTIFY MEXICO', type: 'suscripcion' }),
        item({ merchant: 'Ferretería La Tuerca', categoryRaw: 'mascotas' }),
        item({ merchant: 'Ferretería La Tuerca' }),
        item({ merchant: 'Telcel', category: 'otros' }),
      ],
      { rubros, merchantRubros: rules, recurrings, matchRecurring },
    );
    expect(r.items[0]).toMatchObject({ rubroId: 'r-suscripciones-spotify', category: 'ocio', recurringId: 'rec-spotify' });
    expect(r.items[1]!.rubroId).toBe(RUBRO_POR_CLASIFICAR);
    expect(r.items[1]!.category).toBe('otros');
    expect(r.items[3]).toMatchObject({ rubroId: 'r-servicios-telefonia', category: 'telefonia', recurringId: 'rec-telcel' });
    expect(r.newMerchants).toEqual([{ merchantKey: 'ferreteria la tuerca', merchant: 'Ferretería La Tuerca', rubroId: RUBRO_POR_CLASIFICAR, origin: 'nuevo' }]);
    expect(r.newConcepts).toEqual([expect.objectContaining({ name: 'mascotas', porClasificar: true, parentId: 'r-otros' })]);
  });

  it('classifyItems respeta la categoría de una regla del Mensaje 3', () => {
    const r = classifyItems([item({ merchant: 'Spotify', category: 'colegiaturas' })], { rubros, merchantRubros: rules, recurrings, matchRecurring, keepCategory: () => true });
    expect(r.items[0]).toMatchObject({ rubroId: 'r-suscripciones-spotify', category: 'colegiaturas' });
  });

  it('si Diego cambia el rubro, se guarda como regla del comercio', () => {
    // Comercio con regla general («Uber») pero Diego elige otro rubro para «Uber Taxi»
    expect(learnMerchantRubro('Uber Taxi', 'r-transporte-estacionamiento', rules)).toEqual({
      create: { merchantKey: 'uber taxi', merchant: 'Uber Taxi', rubroId: 'r-transporte-estacionamiento', origin: 'diego' },
    });
    // Regla exacta existente → se actualiza
    expect(learnMerchantRubro('Telcel', 'r-servicios-internet', rules)).toEqual({ update: { id: 'mr-telcel', rubroId: 'r-servicios-internet' } });
    // Sin cambio → nada que guardar
    expect(learnMerchantRubro('Telcel', 'r-servicios-telefonia', rules)).toBeNull();
    expect(learnMerchantRubro('SPOTIFY MEXICO', 'r-suscripciones-spotify', rules)).toBeNull();
    // «Por clasificar» no es una preferencia
    expect(learnMerchantRubro('Nueva', RUBRO_POR_CLASIFICAR, rules)).toBeNull();
    // Comercio nuevo que Diego tipifica → la regla «nuevo» pasa a ser suya
    expect(learnMerchantRubro('Ferretería La Tuerca', 'r-compras-hogar', [rule('Ferretería La Tuerca', RUBRO_POR_CLASIFICAR, 'nuevo')])).toEqual({
      update: { id: 'mr-ferreteria la tuerca', rubroId: 'r-compras-hogar' },
    });
  });
});
