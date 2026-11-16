import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CollectionMap, CollectionName, Settings } from '../lib/types';
import { COLLECTIONS, SETTINGS_ID } from '../lib/types';
import type { DataStore } from './store';

export interface ColState<K extends CollectionName> {
  items: CollectionMap[K][];
  loading: boolean;
  error: string | null;
}

type AllState = { [K in CollectionName]: ColState<K> };

interface Ctx {
  store: DataStore;
  data: AllState;
  retry: () => void;
  /** Cierra sesión / sale de la demo */
  exit?: () => void;
  userLabel?: string;
}

const DataCtx = createContext<Ctx | null>(null);

function initial(): AllState {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, { items: [], loading: true, error: null }])) as unknown as AllState;
}

export function DataProvider({ store, children, exit, userLabel }: { store: DataStore; children: ReactNode; exit?: () => void; userLabel?: string }) {
  const [data, setData] = useState<AllState>(initial);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsubs = COLLECTIONS.map((col) =>
      store.subscribe(
        col,
        (items) => mounted.current && setData((d) => ({ ...d, [col]: { items, loading: false, error: null } })),
        (e) =>
          mounted.current &&
          setData((d) => ({ ...d, [col]: { ...d[col], loading: false, error: humanError(e) } })),
      ),
    );
    return () => {
      mounted.current = false;
      unsubs.forEach((u) => u());
    };
  }, [store, attempt]);

  const retry = useCallback(() => {
    setData(initial());
    setAttempt((a) => a + 1);
  }, []);

  const value = useMemo<Ctx>(() => ({ store, data, retry, exit, userLabel }), [store, data, retry, exit, userLabel]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData fuera de DataProvider');
  return c;
}

export function useCol<K extends CollectionName>(col: K): ColState<K> {
  return useData().data[col];
}

export const DEFAULT_SETTINGS: Omit<Settings, 'id' | 'createdAt'> = {
  salarioMensual: 0,
  diasAguinaldo: 15,
  aniosAntiguedad: 1,
  primaPorcentaje: 25,
};

export function useSettings(): Omit<Settings, 'id' | 'createdAt'> {
  const { items } = useCol('settings');
  const s = items.find((i) => i.id === SETTINGS_ID);
  return s ?? DEFAULT_SETTINGS;
}

export function humanError(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code.includes('permission-denied')) return 'No tienes permiso para ver estos datos. Revisa que entraste con la cuenta autorizada.';
  if (code.includes('unavailable')) return 'Sin conexión con el servidor. Revisa tu internet.';
  if (code.includes('popup-closed')) return 'Cerraste la ventana de Google antes de terminar.';
  if (code.includes('unauthorized-domain')) return 'Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).';
  if (e instanceof Error && e.message) return e.message;
  return 'Ocurrió un error inesperado.';
}
