import { useCallback, useEffect, useState } from 'react';

export interface PricesState {
  prices: Record<string, number>;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  refresh: () => void;
}

const CACHE_KEY = 'finanzas:crypto-prices';

/** Precios en MXN desde la API pública gratuita de CoinGecko (sin llave). */
export function useCryptoPrices(ids: string[]): PricesState {
  const key = [...new Set(ids)].sort().join(',');
  const [state, setState] = useState<Omit<PricesState, 'refresh'>>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { prices: Record<string, number>; at: number } | null;
      if (c) return { prices: c.prices, loading: false, error: null, updatedAt: c.at };
    } catch {
      /* sin caché */
    }
    return { prices: {}, loading: false, error: null, updatedAt: null };
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(key)}&vs_currencies=mxn`, { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 429) throw new Error('CoinGecko limitó las consultas. Intenta en un minuto.');
        if (!r.ok) throw new Error(`CoinGecko respondió ${r.status}.`);
        const json = (await r.json()) as Record<string, { mxn?: number }>;
        const prices: Record<string, number> = {};
        for (const [id, v] of Object.entries(json)) if (typeof v.mxn === 'number') prices[id] = v.mxn;
        const at = Date.now();
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ prices, at }));
        } catch {
          /* nada */
        }
        setState({ prices, loading: false, error: null, updatedAt: at });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'No se pudo obtener el precio.' }));
      });
    return () => ctrl.abort();
  }, [key, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refresh };
}
