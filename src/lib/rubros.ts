/**
 * Catálogo de rubros y clasificación por comercio (Mensaje 4).
 *
 * - Cada rubro principal agrupa subrubros; cada subrubro se registra con una categoría del MVP
 *   para que presupuestos, 50/30/20 y reportes sigan funcionando igual.
 * - La regla comercio → rubro solo SUGIERE: el movimiento sigue pendiente hasta que Diego confirma.
 * - Comercio o concepto desconocido → «Otros / por clasificar». Nunca se inventa un rubro.
 */
import type { ExpenseCategory, InboxItem, MerchantRubro, Recurring, Rubro } from './types';
import { isKnownCategoryTerm, merchantKey } from './ingest';

// ---------- Ids fijos del catálogo base ----------

export const RUBRO_POR_CLASIFICAR = 'r-otros-por-clasificar';
export const RUBRO_OTROS = 'r-otros';
export const RUBRO_NOMINA = 'r-ingresos-nomina';
export const RUBRO_REEMBOLSOS = 'r-ingresos-reembolsos';

type Seed = { id: string; name: string; flow: Rubro['flow']; category?: ExpenseCategory; children: [string, string, ExpenseCategory?][] };

/** Rubros base: [id, nombre, categoría del MVP]. */
const SEED: Seed[] = [
  {
    id: 'r-ingresos', name: 'Ingresos', flow: 'ingreso', children: [
      ['r-ingresos-nomina', 'Nómina'],
      ['r-ingresos-aguinaldo', 'Aguinaldo'],
      ['r-ingresos-prima', 'Prima vacacional'],
      ['r-ingresos-reembolsos', 'Reembolsos'],
      ['r-ingresos-otros', 'Otros ingresos'],
    ],
  },
  {
    id: 'r-vivienda', name: 'Vivienda', flow: 'gasto', category: 'mantenimiento', children: [
      ['r-vivienda-hipoteca', 'Hipoteca', 'mantenimiento'],
      ['r-vivienda-mantenimiento', 'Mantenimiento', 'mantenimiento'],
      ['r-vivienda-terrenos', 'Terrenos (Ciudad Maderas)', 'mantenimiento'],
      ['r-vivienda-renta', 'Renta', 'mantenimiento'],
      ['r-vivienda-luz', 'Luz', 'luz'],
      ['r-vivienda-agua', 'Agua', 'agua'],
      ['r-vivienda-gas', 'Gas', 'gas'],
    ],
  },
  {
    id: 'r-transporte', name: 'Transporte', flow: 'gasto', category: 'transporte', children: [
      ['r-transporte-credito-auto', 'Crédito auto (Nissan)', 'transporte'],
      ['r-transporte-gasolina', 'Gasolina', 'transporte'],
      ['r-transporte-tenencia', 'Tenencia', 'transporte'],
      ['r-transporte-uber-didi', 'Uber / Didi', 'transporte'],
      ['r-transporte-estacionamiento', 'Estacionamiento', 'transporte'],
    ],
  },
  {
    id: 'r-servicios', name: 'Servicios', flow: 'gasto', category: 'telefonia', children: [
      ['r-servicios-telefonia', 'Telefonía (Telcel)', 'telefonia'],
      ['r-servicios-internet', 'Internet', 'telefonia'],
      ['r-servicios-tv', 'TV de paga', 'ocio'],
    ],
  },
  {
    id: 'r-suscripciones', name: 'Suscripciones y entretenimiento', flow: 'gasto', category: 'ocio', children: [
      ['r-suscripciones-spotify', 'Spotify', 'ocio'],
      ['r-suscripciones-netflix', 'Netflix', 'ocio'],
      ['r-suscripciones-vix', 'ViX', 'ocio'],
      ['r-suscripciones-hbo', 'HBO', 'ocio'],
      ['r-suscripciones-prime', 'Amazon Prime', 'ocio'],
      ['r-suscripciones-xbox', 'Xbox', 'ocio'],
      ['r-suscripciones-cine', 'Cine', 'ocio'],
    ],
  },
  {
    id: 'r-alimentacion', name: 'Alimentación', flow: 'gasto', category: 'despensa', children: [
      ['r-alimentacion-despensa', 'Despensa', 'despensa'],
      ['r-alimentacion-uber-eats', 'Uber Eats', 'ocio'],
      ['r-alimentacion-restaurantes', 'Restaurantes', 'ocio'],
      ['r-alimentacion-cafe', 'Café', 'ocio'],
    ],
  },
  {
    id: 'r-compras', name: 'Compras', flow: 'gasto', category: 'otros', children: [
      ['r-compras-ropa', 'Ropa', 'otros'],
      ['r-compras-electronica', 'Electrónica', 'otros'],
      ['r-compras-mercado-libre', 'Mercado Libre', 'otros'],
      ['r-compras-amazon', 'Amazon', 'otros'],
      ['r-compras-hogar', 'Hogar', 'mantenimiento'],
    ],
  },
  {
    id: 'r-salud', name: 'Salud', flow: 'gasto', category: 'salud', children: [
      ['r-salud-medico', 'Médico', 'salud'],
      ['r-salud-farmacia', 'Farmacia', 'salud'],
      ['r-salud-seguro', 'Seguro de salud', 'salud'],
    ],
  },
  {
    id: 'r-tarjetas', name: 'Tarjetas y créditos', flow: 'gasto', category: 'otros', children: [
      ['r-tarjetas-pagos', 'Pagos a tarjetas', 'otros'],
      ['r-tarjetas-intereses', 'Intereses', 'otros'],
      ['r-tarjetas-anualidades', 'Anualidades', 'otros'],
    ],
  },
  {
    id: RUBRO_OTROS, name: 'Otros / por clasificar', flow: 'gasto', category: 'otros', children: [
      [RUBRO_POR_CLASIFICAR, 'Por clasificar', 'otros'],
    ],
  },
];

export type NewRubro = Omit<Rubro, 'createdAt'>;

/** Catálogo base completo (rubros principales y subrubros) con ids fijos. */
export function baseRubros(): NewRubro[] {
  const out: NewRubro[] = [];
  SEED.forEach((g, gi) => {
    out.push({ id: g.id, name: g.name, flow: g.flow, order: gi, ...(g.category ? { category: g.category } : {}) });
    g.children.forEach(([id, name, category], ci) => {
      out.push({ id, name, flow: g.flow, parentId: g.id, order: ci, ...(category ? { category } : {}) });
    });
  });
  return out;
}

/** Reglas comercio → rubro del alta inicial (comercios que Diego nombró en su catálogo). */
export const BASE_MERCHANT_RUBROS: { merchant: string; rubroId: string }[] = [
  { merchant: 'Spotify', rubroId: 'r-suscripciones-spotify' },
  { merchant: 'Netflix', rubroId: 'r-suscripciones-netflix' },
  { merchant: 'ViX', rubroId: 'r-suscripciones-vix' },
  { merchant: 'HBO', rubroId: 'r-suscripciones-hbo' },
  { merchant: 'Amazon Prime', rubroId: 'r-suscripciones-prime' },
  { merchant: 'Xbox', rubroId: 'r-suscripciones-xbox' },
  { merchant: 'Telcel', rubroId: 'r-servicios-telefonia' },
  { merchant: 'Uber Eats', rubroId: 'r-alimentacion-uber-eats' },
  { merchant: 'Uber', rubroId: 'r-transporte-uber-didi' },
  { merchant: 'Didi', rubroId: 'r-transporte-uber-didi' },
  { merchant: 'Mercado Libre', rubroId: 'r-compras-mercado-libre' },
  { merchant: 'Amazon', rubroId: 'r-compras-amazon' },
  { merchant: 'Ciudad Maderas', rubroId: 'r-vivienda-terrenos' },
  { merchant: 'Nissan', rubroId: 'r-transporte-credito-auto' },
];

// ---------- Consultas sobre el catálogo ----------

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function rubroById(rubros: readonly Rubro[], id: string | undefined): Rubro | undefined {
  return id ? rubros.find((r) => r.id === id) : undefined;
}

/** «Vivienda › Mantenimiento». */
export function rubroLabel(rubros: readonly Rubro[], id: string | undefined): string {
  const r = rubroById(rubros, id);
  if (!r) return 'Sin rubro';
  const p = rubroById(rubros, r.parentId);
  return p ? `${p.name} › ${r.name}` : r.name;
}

/** Categoría del MVP con que se registra un rubro (la del subrubro o, si no tiene, la de su rubro principal). */
export function categoryOfRubro(rubros: readonly Rubro[], id: string | undefined): ExpenseCategory | undefined {
  const r = rubroById(rubros, id);
  if (!r) return undefined;
  return r.category ?? rubroById(rubros, r.parentId)?.category;
}

export interface RubroGroup {
  group: Rubro;
  children: Rubro[];
}

/** Árbol ordenado (rubros principales con sus subrubros). */
export function rubroTree(rubros: readonly Rubro[], flow?: Rubro['flow']): RubroGroup[] {
  const byOrder = (a: Rubro, b: Rubro) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'es');
  return rubros
    .filter((r) => !r.parentId && (!flow || r.flow === flow))
    .sort(byOrder)
    .map((group) => ({ group, children: rubros.filter((r) => r.parentId === group.id).sort(byOrder) }));
}

/** Rubros pendientes de tipificar: los marcados «por clasificar» (además del cajón base). */
export function unclassifiedRubros(rubros: readonly Rubro[]): Rubro[] {
  return rubros.filter((r) => r.porClasificar);
}

// ---------- Comercio → rubro ----------

/**
 * Busca la regla del comercio. Coincide por clave normalizada completa o por palabras completas
 * («SPOTIFY MEXICO» → «spotify»; «UBER EATS» → «uber eats» antes que «uber»).
 * Prioridad: regla que Diego cambió > la más específica (más larga).
 */
export function findMerchantRubro(merchant: string, rules: readonly MerchantRubro[]): MerchantRubro | undefined {
  const key = merchantKey(merchant);
  if (!key) return undefined;
  const padded = ` ${key} `;
  const hits = rules.filter((r) => r.merchantKey && (r.merchantKey === key || padded.includes(` ${r.merchantKey} `)));
  if (!hits.length) return undefined;
  const rank = (r: MerchantRubro) => (r.merchantKey === key ? 2000 : 0) + (r.origin === 'diego' ? 1000 : 0) + r.merchantKey.length;
  return [...hits].sort((a, b) => rank(b) - rank(a))[0];
}

export interface RubroSuggestion {
  rubroId: string;
  /** De dónde salió: regla del comercio, recurrente, tipo de movimiento o «por clasificar». */
  via: 'regla' | 'recurrente' | 'tipo' | 'por_clasificar';
}

/** Rubro sugerido para un movimiento detectado. */
export function suggestRubro(
  item: Pick<InboxItem, 'merchant' | 'direction' | 'type'>,
  ctx: { rubros: readonly Rubro[]; merchantRubros: readonly MerchantRubro[]; recurring?: Recurring },
): RubroSuggestion {
  const exists = (id: string | undefined) => !!id && ctx.rubros.some((r) => r.id === id);
  const rule = findMerchantRubro(item.merchant, ctx.merchantRubros);
  // Una regla «nuevo» apunta a por clasificar: no es una sugerencia real.
  if (rule && rule.origin !== 'nuevo' && exists(rule.rubroId)) return { rubroId: rule.rubroId, via: 'regla' };
  if (ctx.recurring && exists(ctx.recurring.rubroId)) return { rubroId: ctx.recurring.rubroId, via: 'recurrente' };
  if (item.type === 'reembolso' && exists(RUBRO_REEMBOLSOS)) return { rubroId: RUBRO_REEMBOLSOS, via: 'tipo' };
  return { rubroId: RUBRO_POR_CLASIFICAR, via: 'por_clasificar' };
}

export type NewMerchantRubro = Omit<MerchantRubro, 'id' | 'createdAt'>;
export type NewRubroDoc = Omit<Rubro, 'id' | 'createdAt'>;

export interface ClassifyResult<T> {
  items: T[];
  /** Comercios desconocidos: se agregan como «por clasificar». */
  newMerchants: NewMerchantRubro[];
  /** Conceptos que Byte sugirió y no existen en el catálogo: se agregan como «por clasificar». */
  newConcepts: NewRubroDoc[];
}

/**
 * Clasifica renglones recién importados: rubro sugerido, recurrente que coincide y categoría del MVP.
 * - Si el comercio tiene regla de Mensaje 3 (`keepCategory`), se respeta esa categoría.
 * - Comercio sin regla → se agrega como «por clasificar» (una vez por comercio).
 * - Concepto de Byte desconocido (category_suggested que no existe como rubro) → rubro «por clasificar».
 */
export function classifyItems<T extends Pick<InboxItem, 'merchant' | 'description' | 'direction' | 'type' | 'category' | 'categoryRaw' | 'date' | 'amount'> & { rubroId?: string; recurringId?: string }>(
  items: readonly T[],
  ctx: {
    rubros: readonly Rubro[];
    merchantRubros: readonly MerchantRubro[];
    recurrings: readonly Recurring[];
    /** Comercios con regla de categoría del Mensaje 3 (su categoría manda). */
    keepCategory?: (merchant: string) => boolean;
    matchRecurring: (item: T, recurrings: readonly Recurring[]) => Recurring | undefined;
  },
): ClassifyResult<T> {
  const newMerchants: NewMerchantRubro[] = [];
  const newConcepts: NewRubroDoc[] = [];
  const knownMerchants = [...ctx.merchantRubros];
  const conceptNames = new Set(ctx.rubros.map((r) => fold(r.name)));

  const out = items.map((it) => {
    const recurring = ctx.matchRecurring(it, ctx.recurrings);
    const s = suggestRubro(it, { rubros: ctx.rubros, merchantRubros: knownMerchants, recurring });
    const next: T = { ...it, rubroId: s.rubroId };
    if (recurring) next.recurringId = recurring.id;

    if (s.via === 'por_clasificar' && !findMerchantRubro(it.merchant, knownMerchants)) {
      const key = merchantKey(it.merchant);
      if (key) {
        const m: NewMerchantRubro = { merchantKey: key, merchant: it.merchant, rubroId: RUBRO_POR_CLASIFICAR, origin: 'nuevo' };
        newMerchants.push(m);
        knownMerchants.push({ ...m, id: `nuevo-${key}`, createdAt: 0 });
      }
    }
    // Concepto nuevo: solo si el comercio tampoco se reconoce y Byte sugirió algo que no es categoría ni sinónimo conocido.
    if (s.via === 'por_clasificar' && it.categoryRaw && !isKnownCategoryTerm(it.categoryRaw) && !conceptNames.has(fold(it.categoryRaw))) {
      conceptNames.add(fold(it.categoryRaw));
      newConcepts.push({ name: it.categoryRaw.slice(0, 40), parentId: RUBRO_OTROS, flow: it.direction === 'entrada' ? 'ingreso' : 'gasto', category: 'otros', porClasificar: true });
    }
    const cat = categoryOfRubro(ctx.rubros, s.rubroId);
    if (it.direction === 'salida' && cat && s.via !== 'por_clasificar' && !ctx.keepCategory?.(it.merchant)) next.category = cat;
    return next;
  });
  return { items: out, newMerchants, newConcepts };
}

/**
 * Regla que resulta cuando Diego confirma un movimiento con un rubro.
 * Si cambió el rubro (o el comercio estaba por clasificar), se guarda como preferencia de Diego.
 * Regresa null si no hay nada que guardar.
 */
export function learnMerchantRubro(
  merchant: string,
  chosenRubroId: string | undefined,
  rules: readonly MerchantRubro[],
): { update?: { id: string; rubroId: string }; create?: NewMerchantRubro } | null {
  if (!chosenRubroId || chosenRubroId === RUBRO_POR_CLASIFICAR) return null;
  const key = merchantKey(merchant);
  if (!key) return null;
  const exact = rules.find((r) => r.merchantKey === key);
  if (exact) {
    if (exact.rubroId === chosenRubroId && exact.origin !== 'nuevo') return null;
    return { update: { id: exact.id, rubroId: chosenRubroId } };
  }
  const general = findMerchantRubro(merchant, rules);
  if (general && general.rubroId === chosenRubroId && general.origin !== 'nuevo') return null;
  return { create: { merchantKey: key, merchant, rubroId: chosenRubroId, origin: 'diego' } };
}
