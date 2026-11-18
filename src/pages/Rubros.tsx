import { useState } from 'react';
import { Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { useCol, useData, humanError } from '../data/DataContext';
import { CATEGORIES } from '../lib/catalog';
import { merchantKey } from '../lib/ingest';
import { RUBRO_POR_CLASIFICAR, categoryOfRubro, rubroLabel, rubroTree } from '../lib/rubros';
import type { Rubro } from '../lib/types';
import { Pill, RubroSelect } from '../components/rubroUi';
import { Button, EmptyState, ErrorState, IconButton, ListSkeleton, PageHeader, Panel, useToast } from '../components/ui';

const inputCls = 'min-h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm text-ink';

export function RubrosPage() {
  const { store, retry } = useData();
  const rubros = useCol('rubros');
  const merchantRubros = useCol('merchantRubros').items;
  const toast = useToast();
  const [newGroup, setNewGroup] = useState('');

  const tree = rubroTree(rubros.items);
  const groups = tree.map((t) => t.group);
  const pendingConcepts = rubros.items.filter((r) => r.porClasificar);
  const pendingMerchants = merchantRubros.filter((m) => m.origin === 'nuevo' || m.rubroId === RUBRO_POR_CLASIFICAR);
  const rules = merchantRubros.filter((m) => !pendingMerchants.includes(m)).sort((a, b) => a.merchant.localeCompare(b.merchant, 'es'));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(humanError(e), 'error');
    }
  };

  /** Mover un subrubro a otro rubro principal (toma la categoría del destino si no tenía una propia). */
  const move = (r: Rubro, parentId: string) => {
    const parent = rubros.items.find((g) => g.id === parentId);
    return run(() => store.update('rubros', r.id, { parentId, flow: parent?.flow ?? r.flow, porClasificar: undefined, ...(parent?.category ? { category: parent.category } : {}) }), `«${r.name}» ahora está en ${parent?.name ?? '—'}`);
  };

  if (rubros.error) return <ErrorState message={rubros.error} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Rubros" subtitle="Catálogo para ordenar y dar seguimiento. Cada comercio sugiere un rubro; tú confirmas. Lo nuevo llega «por clasificar»." />

      <Panel title={`Por clasificar${pendingConcepts.length + pendingMerchants.length ? ` (${pendingConcepts.length + pendingMerchants.length})` : ''}`}>
        {!pendingConcepts.length && !pendingMerchants.length ? (
          <p className="text-sm text-muted">Nada por clasificar. Cuando llegue un comercio o concepto nuevo desde el correo, aparecerá aquí.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pendingConcepts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="concepto-por-clasificar">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-muted">Concepto nuevo sugerido por Byte · <Pill>Por clasificar</Pill></p>
                </div>
                <label className="text-xs font-semibold text-ink-2">
                  Mover a
                  <select className="ml-2 min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink" value="" onChange={(e) => e.target.value && void move(r, e.target.value)}>
                    <option value="">Elegir rubro…</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
              </li>
            ))}
            {pendingMerchants.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="comercio-por-clasificar">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{m.merchant}</p>
                  <p className="text-xs text-muted">Comercio nuevo · <Pill>Por clasificar</Pill></p>
                </div>
                <RubroSelect
                  aria-label={`Rubro para ${m.merchant}`}
                  className="w-full sm:w-auto sm:min-w-56"
                  rubros={rubros.items}
                  value={m.rubroId}
                  onChange={(id) => void run(() => store.update('merchantRubros', m.id, { rubroId: id, origin: 'diego' }), `${m.merchant} → ${rubroLabel(rubros.items, id)}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Catálogo"
        action={
          <form className="flex w-full gap-2 sm:w-auto" onSubmit={(e) => {
            e.preventDefault();
            const name = newGroup.trim();
            if (!name) return;
            void run(() => store.add('rubros', { name, flow: 'gasto', category: 'otros', order: groups.length }), `Rubro «${name}» agregado`);
            setNewGroup('');
          }}>
            <input aria-label="Nuevo rubro principal" className={inputCls} value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Nuevo rubro principal" maxLength={40} />
            <Button type="submit" variant="secondary"><Plus className="size-4" aria-hidden /> Agregar</Button>
          </form>
        }
      >
        {rubros.loading ? <ListSkeleton /> : !tree.length ? (
          <EmptyState icon={<Tags />} title="Sin catálogo" text="El alta inicial crea los rubros base." />
        ) : (
          <div className="space-y-5">
            {tree.map(({ group, children }) => (
              <section key={group.id} data-testid="rubro-grupo">
                <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
                  <RenameInline rubro={group} heading />
                  <span className="text-xs text-muted">{group.flow === 'ingreso' ? 'Ingresos' : `Se registra como ${CATEGORIES[group.category ?? 'otros'].label}`}</span>
                </div>
                <ul className="divide-y divide-line">
                  {children.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="subrubro">
                      <RenameInline rubro={c} />
                      {c.porClasificar && <Pill>Por clasificar</Pill>}
                      {c.flow === 'gasto' && <span className="text-xs text-muted">{CATEGORIES[categoryOfRubro(rubros.items, c.id) ?? 'otros'].label}</span>}
                      <select
                        aria-label={`Reasignar ${c.name}`}
                        className="ml-auto min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
                        value={group.id}
                        onChange={(e) => void move(c, e.target.value)}
                      >
                        {groups.filter((g) => g.flow === group.flow || g.id === group.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      {c.id !== RUBRO_POR_CLASIFICAR && (
                        <IconButton label={`Eliminar ${c.name}`} onClick={() => window.confirm(`¿Eliminar «${c.name}»? Los movimientos ya registrados conservan su categoría.`) && void run(() => store.remove('rubros', c.id), 'Rubro eliminado')}>
                          <Trash2 className="size-4" aria-hidden />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
                <AddChild group={group} count={children.length} />
              </section>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Reglas por comercio (${rules.length})`}>
        <p className="mb-3 text-sm text-muted">Comercio → rubro sugerido. Al confirmar un movimiento con otro rubro, la regla se actualiza sola. Solo sugiere: nada se confirma sin ti.</p>
        <AddRule />
        <ul className="mt-3 divide-y divide-line">
          {rules.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-2" data-testid="regla-rubro">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{m.merchant}</p>
                <p className="text-xs text-muted">{m.origin === 'diego' ? 'Tu preferencia' : 'Catálogo inicial'}</p>
              </div>
              <RubroSelect
                aria-label={`Rubro para ${m.merchant}`}
                className="w-full sm:w-auto sm:min-w-56"
                rubros={rubros.items}
                value={m.rubroId}
                onChange={(id) => void run(() => store.update('merchantRubros', m.id, { rubroId: id, origin: 'diego' }), `${m.merchant} → ${rubroLabel(rubros.items, id)}`)}
              />
              <IconButton label={`Eliminar regla de ${m.merchant}`} onClick={() => void run(() => store.remove('merchantRubros', m.id), 'Regla eliminada')}>
                <Trash2 className="size-4" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function RenameInline({ rubro, heading }: { rubro: Rubro; heading?: boolean }) {
  const { store } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(rubro.name);
  if (!editing) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span className={heading ? 'text-base font-bold text-ink' : 'text-sm font-semibold text-ink'}>{rubro.name}</span>
        <IconButton label={`Renombrar ${rubro.name}`} onClick={() => { setName(rubro.name); setEditing(true); }}><Pencil className="size-4" aria-hidden /></IconButton>
      </span>
    );
  }
  return (
    <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={async (e) => {
      e.preventDefault();
      const n = name.trim();
      if (!n) return;
      try {
        await store.update('rubros', rubro.id, { name: n });
        toast('Rubro renombrado');
        setEditing(false);
      } catch (err) {
        toast(humanError(err), 'error');
      }
    }}>
      <input aria-label={`Nuevo nombre de ${rubro.name}`} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
      <IconButton label="Guardar nombre" type="submit"><Check className="size-4" aria-hidden /></IconButton>
      <IconButton label="Cancelar" type="button" onClick={() => setEditing(false)}><X className="size-4" aria-hidden /></IconButton>
    </form>
  );
}

function AddChild({ group, count }: { group: Rubro; count: number }) {
  const { store } = useData();
  const toast = useToast();
  const [name, setName] = useState('');
  return (
    <form className="mt-2 flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const n = name.trim();
      if (!n) return;
      try {
        await store.add('rubros', { name: n, parentId: group.id, flow: group.flow, order: count, ...(group.category ? { category: group.category } : {}) });
        toast(`«${n}» agregado a ${group.name}`);
        setName('');
      } catch (err) {
        toast(humanError(err), 'error');
      }
    }}>
      <input aria-label={`Nuevo subrubro en ${group.name}`} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={`Agregar a ${group.name}`} maxLength={40} />
      <Button type="submit" variant="ghost"><Plus className="size-4" aria-hidden /> Agregar</Button>
    </form>
  );
}

function AddRule() {
  const { store } = useData();
  const rubros = useCol('rubros').items;
  const merchantRubros = useCol('merchantRubros').items;
  const toast = useToast();
  const [merchant, setMerchant] = useState('');
  const [rubroId, setRubroId] = useState(RUBRO_POR_CLASIFICAR);
  return (
    <form className="flex flex-wrap gap-2 [&>input]:min-w-40" onSubmit={async (e) => {
      e.preventDefault();
      const m = merchant.trim();
      const key = merchantKey(m);
      if (!key) return;
      try {
        const existing = merchantRubros.find((x) => x.merchantKey === key);
        if (existing) await store.update('merchantRubros', existing.id, { rubroId, origin: 'diego' });
        else await store.add('merchantRubros', { merchant: m, merchantKey: key, rubroId, origin: 'diego' });
        toast(`${m} → ${rubroLabel(rubros, rubroId)}`);
        setMerchant('');
      } catch (err) {
        toast(humanError(err), 'error');
      }
    }}>
      <input aria-label="Comercio" className={inputCls} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Comercio (p. ej. Starbucks)" maxLength={60} />
      <RubroSelect aria-label="Rubro de la regla" className="w-full sm:w-auto sm:min-w-56" rubros={rubros} value={rubroId} onChange={setRubroId} />
      <Button type="submit" variant="secondary"><Plus className="size-4" aria-hidden /> Regla</Button>
    </form>
  );
}
