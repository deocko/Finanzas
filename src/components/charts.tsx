import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CATEGORIES } from '../lib/catalog';
import { formatMXN, formatMXNShort, type Cents } from '../lib/money';
import { formatPeriod } from '../lib/dates';
import type { ExpenseCategory } from '../lib/types';
import { CategoryBadge } from './icons';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Escala "bonita" para el eje Y. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * exp;
}

function Tooltip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.min(Math.max(8, x - 90), Math.max(8, width - 188));
  return (
    <div
      className="pointer-events-none absolute z-10 w-[180px] rounded-control border border-line bg-surface px-3 py-2 text-xs text-ink shadow-card"
      style={{ left, top: Math.max(0, y - 8), transform: 'translateY(-100%)' }}
      role="status"
    >
      {children}
    </div>
  );
}

// ---------- Gasto por categoría: barras horizontales con etiqueta directa ----------

export function CategoryBars({ data }: { data: { category: ExpenseCategory; total: Cents }[] }) {
  const total = data.reduce((a, b) => a + b.total, 0);
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <ul className="space-y-3" aria-label="Gasto por categoría">
      {data.map((d) => {
        const pct = total ? Math.round((d.total / total) * 100) : 0;
        return (
          <li key={d.category} className="group flex items-center gap-3" title={`${CATEGORIES[d.category].label}: ${formatMXN(d.total)} (${pct} %)`}>
            <CategoryBadge category={d.category} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold text-ink">{CATEGORIES[d.category].label}</span>
                <span className="num shrink-0 font-bold text-ink">
                  {formatMXN(d.total)} <span className="font-medium text-muted">· {pct} %</span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-surface-2">
                <div
                  className="h-2 rounded-full transition-[width] group-hover:opacity-80"
                  style={{ width: `${Math.max(2, (d.total / max) * 100)}%`, background: CATEGORIES[d.category].color }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Ingresos vs gastos por mes: barras agrupadas ----------

export interface MonthBar { period: string; income: Cents; expense: Cents; balance: Cents; cumulative?: Cents }

const PAD = { l: 68, r: 24, t: 12, b: 28 };

export function IncomeExpenseChart({ data, height = 220 }: { data: MonthBar[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.income, d.expense)), 0));
  const iw = Math.max(0, width - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const band = data.length ? iw / data.length : 0;
  const barW = Math.max(4, Math.min(22, (band - 12) / 2));
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const h = hover !== null ? data[hover] : undefined;

  return (
    <div>
      <Legend items={[{ label: 'Ingresos', color: 'var(--ingreso)' }, { label: 'Gastos', color: 'var(--gasto)' }]} />
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Ingresos contra gastos por mes">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 3'} />
                <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
                  {formatMXNShort(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.l + band * i + band / 2;
              return (
                <g key={d.period}>
                  {hover === i && <rect x={PAD.l + band * i + 2} y={PAD.t} width={band - 4} height={ih} fill="var(--surface-2)" rx={6} />}
                  <Bar x={cx - barW - 1} w={barW} y0={y(0)} y1={y(d.income)} color="var(--ingreso)" />
                  <Bar x={cx + 1} w={barW} y0={y(0)} y1={y(d.expense)} color="var(--gasto)" />
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{formatPeriod(d.period)}</text>
                  <rect
                    x={PAD.l + band * i}
                    y={0}
                    width={band}
                    height={height}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {h && hover !== null && (
          <Tooltip x={PAD.l + band * hover + band / 2} y={PAD.t + 8} width={width}>
            <p className="mb-1 font-bold">{formatPeriod(h.period, true)}</p>
            <Row color="var(--ingreso)" label="Ingresos" value={formatMXN(h.income)} />
            <Row color="var(--gasto)" label="Gastos" value={formatMXN(h.expense)} />
            <p className="mt-1 border-t border-line pt-1 font-bold">Balance: <span className="num">{formatMXN(h.balance)}</span></p>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function Bar({ x, w, y0, y1, color }: { x: number; w: number; y0: number; y1: number; color: string }) {
  const hgt = Math.max(0, y0 - y1);
  if (hgt < 1) return null;
  const r = Math.min(4, hgt, w / 2);
  // esquinas superiores redondeadas, base recta anclada al eje
  const d = `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  return <path d={d} fill={color} />;
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: color }} />{label}</span>
      <span className="num font-semibold">{value}</span>
    </p>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-4 text-xs font-semibold text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

// ---------- Evolución del balance acumulado: línea ----------

export function BalanceLine({ data, height = 200 }: { data: { period: string; value: Cents }[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d.value);
  const hi = niceMax(Math.max(0, ...values));
  const lo = Math.min(0, ...values) < 0 ? -niceMax(-Math.min(...values)) : 0;
  const iw = Math.max(0, width - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (data.length <= 1 ? iw / 2 : (iw * i) / (data.length - 1));
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ');
  const ticks = lo < 0 ? [lo, 0, hi] : [0, hi / 2, hi];
  const h = hover !== null ? data[hover] : undefined;

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Evolución del balance acumulado"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left;
            const i = data.length <= 1 ? 0 : Math.round(((px - PAD.l) / iw) * (data.length - 1));
            setHover(Math.min(data.length - 1, Math.max(0, i)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 3'} />
              <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="num">{formatMXNShort(t)}</text>
            </g>
          ))}
          {data.map((d, i) => (
            <text key={d.period} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{formatPeriod(d.period)}</text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--muted)" strokeDasharray="2 3" />}
          <path d={path} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle key={d.period} cx={x(i)} cy={y(d.value)} r={hover === i ? 5 : 4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
          ))}
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={x(hover)} y={y(h.value)} width={width}>
          <p className="font-bold">{formatPeriod(h.period, true)}</p>
          <p className="num">Acumulado: <strong>{formatMXN(h.value)}</strong></p>
        </Tooltip>
      )}
    </div>
  );
}
