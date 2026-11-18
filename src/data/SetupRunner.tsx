import { useEffect, useRef } from 'react';
import { SETUP_META_ID, SETUP_VERSION, planSetup } from '../lib/setup';
import { todayISO } from '../lib/dates';
import { useCol, useData } from './DataContext';

/**
 * Aplica el alta inicial (cuentas, recurrentes y catálogo de rubros) una sola vez por versión.
 * Solo crea lo que falta, con ids fijos: no duplica ni sobrescribe lo que Diego ya editó.
 */
export function SetupRunner() {
  const { store } = useData();
  const meta = useCol('meta');
  const accounts = useCol('accounts');
  const rubros = useCol('rubros');
  const merchantRubros = useCol('merchantRubros');
  const recurrings = useCol('recurrings');
  const running = useRef(false);

  const cols = [meta, accounts, rubros, merchantRubros, recurrings];
  const ready = cols.every((c) => !c.loading && !c.error);
  const done = (meta.items.find((m) => m.id === SETUP_META_ID)?.setupVersion ?? 0) >= SETUP_VERSION;

  useEffect(() => {
    if (!ready || done || running.current) return;
    running.current = true;
    const ops = planSetup({ accounts: accounts.items, rubros: rubros.items, merchantRubros: merchantRubros.items, recurrings: recurrings.items }, todayISO());
    void (async () => {
      try {
        for (const op of ops) await store.set(op.col, op.id, op.data as never);
        await store.set('meta', SETUP_META_ID, { setupVersion: SETUP_VERSION, appliedAt: Date.now() });
      } catch (e) {
        console.error('[Finanfy] No se pudo aplicar el alta inicial', e);
        running.current = false;
      }
    })();
  }, [ready, done, store, accounts.items, rubros.items, merchantRubros.items, recurrings.items]);

  return null;
}
