import { useMemo } from 'react';
import { Bitcoin, Landmark, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCol, useData } from '../data/DataContext';
import { useCryptoPrices } from '../data/useCryptoPrices';
import { fundGain, valueCrypto } from '../lib/finance';
import { formatDate } from '../lib/dates';
import { formatMXN, sumCents } from '../lib/money';
import { useConfirmDelete } from '../components/rows';
import { useSheet } from '../components/SheetHost';
import { Button, EmptyState, ErrorState, IconButton, ListSkeleton, PageHeader, Panel, cx } from '../components/ui';

const pct = (x: number | null) => (x === null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)} %`);

function Gain({ value, ratio }: { value: number | null; ratio: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  const up = value >= 0;
  return (
    <span className={cx('num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', up ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}>
      {up ? '▲' : '▼'} {formatMXN(value)} ({pct(ratio)})
    </span>
  );
}

export function Investments() {
  const { store, retry } = useData();
  const crypto = useCol('crypto');
  const funds = useCol('funds');
  const open = useSheet();
  const confirm = useConfirmDelete();
  const prices = useCryptoPrices(crypto.items.map((c) => c.coinId));

  const vals = useMemo(() => crypto.items.map((h) => ({ h, v: valueCrypto(h, prices.prices[h.coinId]) })), [crypto.items, prices.prices]);
  const cryptoCost = sumCents(vals.map((x) => x.v.cost));
  const cryptoValue = vals.every((x) => x.v.value !== null) ? sumCents(vals.map((x) => x.v.value ?? 0)) : null;
  const fundInv = sumCents(funds.items.map((f) => f.invested));
  const fundVal = sumCents(funds.items.map((f) => f.currentValue));
  const total = (cryptoValue ?? cryptoCost) + fundVal;

  return (
    <div className="space-y-6">
      <PageHeader title="Inversiones" subtitle="Criptomonedas con precio en vivo y fondos con captura manual." />
      <section className="rounded-card bg-surface p-6 shadow-card">
        <p className="text-sm font-semibold text-muted">Valor total estimado</p>
        <p className="num text-4xl font-extrabold text-ink">{formatMXN(total)}</p>
        <p className="mt-1 text-xs text-muted">Cripto a precio actual{cryptoValue === null && crypto.items.length ? ' (sin precio en vivo: se usa costo de compra)' : ''} + fondos al último valor capturado.</p>
      </section>

      <Panel
        title={<span className="flex items-center gap-2"><Bitcoin className="size-5 text-[#F7931A]" aria-hidden /> Criptomonedas</span>}
        action={
          <div className="flex gap-2">
            <IconButton label="Actualizar precios" onClick={prices.refresh} disabled={prices.loading || !crypto.items.length}>
              <RefreshCw className={cx('size-5', prices.loading && 'animate-spin')} aria-hidden />
            </IconButton>
            <Button onClick={() => open({ kind: 'crypto' })}><Plus className="size-4" aria-hidden /> Agregar</Button>
          </div>
        }
      >
        {prices.error && crypto.items.length > 0 && (
          <div className="mb-4"><ErrorState message={`No se pudo actualizar el precio: ${prices.error}`} onRetry={prices.refresh} /></div>
        )}
        {crypto.error ? (
          <ErrorState message={crypto.error} onRetry={retry} />
        ) : crypto.loading ? (
          <ListSkeleton />
        ) : crypto.items.length ? (
          <>
            <ul className="divide-y divide-line">
              {vals.map(({ h, v }) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-extrabold text-ink">{h.symbol}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{h.name}</p>
                    <p className="num text-xs text-muted">
                      {h.quantity} {h.symbol} · compra {formatMXN(h.buyPrice)} c/u · {formatDate(h.buyDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-bold text-ink">{v.value !== null ? formatMXN(v.value) : prices.loading ? 'Cargando…' : '—'}</p>
                    <Gain value={v.gain} ratio={v.gainPct} />
                  </div>
                  <div className="flex">
                    <IconButton label={`Editar ${h.name}`} onClick={() => open({ kind: 'crypto', initial: h })}><Pencil className="size-4" aria-hidden /></IconButton>
                    <IconButton label={`Eliminar ${h.name}`} onClick={() => confirm(`${h.name}`, () => store.remove('crypto', h.id))}><Trash2 className="size-4" aria-hidden /></IconButton>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
              <span>Costo total: <strong className="num text-ink">{formatMXN(cryptoCost)}</strong>{cryptoValue !== null && <> · Ganancia: <Gain value={cryptoValue - cryptoCost} ratio={cryptoCost ? (cryptoValue - cryptoCost) / cryptoCost : null} /></>}</span>
              <span>
                Precios: CoinGecko (gratis){prices.updatedAt ? ` · ${new Date(prices.updatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </p>
          </>
        ) : (
          <EmptyState icon={<Bitcoin />} title="Sin criptomonedas" text="Registra cuánto tienes y a qué precio compraste; calculamos tu ganancia con el precio en vivo." action={<Button onClick={() => open({ kind: 'crypto' })}>Agregar criptomoneda</Button>} />
        )}
      </Panel>

      <Panel
        title={<span className="flex items-center gap-2"><Landmark className="size-5 text-brand" aria-hidden /> Fondos de inversión</span>}
        action={<Button onClick={() => open({ kind: 'fund' })}><Plus className="size-4" aria-hidden /> Agregar</Button>}
      >
        {funds.error ? (
          <ErrorState message={funds.error} onRetry={retry} />
        ) : funds.loading ? (
          <ListSkeleton />
        ) : funds.items.length ? (
          <>
            <ul className="divide-y divide-line">
              {funds.items.map((f) => {
                const g = fundGain(f);
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Landmark className="size-5" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{f.name}</p>
                      <p className="num text-xs text-muted">
                        {f.institution} · invertido {formatMXN(f.invested)} · rend. reportado {f.reportedYield} % · al {formatDate(f.date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num text-sm font-bold text-ink">{formatMXN(f.currentValue)}</p>
                      <Gain value={g.gain} ratio={g.gainPct} />
                    </div>
                    <div className="flex">
                      <IconButton label={`Actualizar ${f.name}`} onClick={() => open({ kind: 'fund', initial: f })}><Pencil className="size-4" aria-hidden /></IconButton>
                      <IconButton label={`Eliminar ${f.name}`} onClick={() => confirm(`el fondo «${f.name}»`, () => store.remove('funds', f.id))}><Trash2 className="size-4" aria-hidden /></IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
              Invertido: <strong className="num text-ink">{formatMXN(fundInv)}</strong> · Valor: <strong className="num text-ink">{formatMXN(fundVal)}</strong> ·{' '}
              <Gain value={fundVal - fundInv} ratio={fundInv ? (fundVal - fundInv) / fundInv : null} />
            </p>
          </>
        ) : (
          <EmptyState icon={<Landmark />} title="Sin fondos" text="Registra tus fondos y actualiza su valor con cada estado de cuenta." action={<Button onClick={() => open({ kind: 'fund' })}>Agregar fondo</Button>} />
        )}
      </Panel>
    </div>
  );
}
