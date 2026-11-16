import { Nfc } from 'lucide-react';
import type { CardBrand } from '../lib/types';
import { formatMXN } from '../lib/money';
import { cx } from './ui';

interface Props {
  kind: 'credito' | 'debito';
  bank: string;
  alias?: string;
  brand: CardBrand;
  last4: string;
  holder: string;
  color: string;
  balance?: number;
  className?: string;
}

function BrandMark({ brand }: { brand: CardBrand }) {
  switch (brand) {
    case 'visa':
      return <span className="text-2xl font-black italic tracking-tight">VISA</span>;
    case 'mastercard':
      return (
        <span className="flex items-center" role="img" aria-label="Mastercard">
          <span className="size-8 rounded-full bg-[#EB001B]" />
          <span className="-ml-3 size-8 rounded-full bg-[#F79E1B] mix-blend-screen" />
        </span>
      );
    case 'amex':
      return <span className="rounded bg-white/90 px-1.5 py-0.5 text-xs font-black tracking-wider text-[#1F6FB5]">AMEX</span>;
    case 'carnet':
      return <span className="text-lg font-extrabold tracking-wide">Carnet</span>;
    default:
      return <span className="text-sm font-bold uppercase tracking-widest">Tarjeta</span>;
  }
}

/** El chip: dibujado en SVG, dorado sólido con contactos. */
function Chip() {
  return (
    <svg viewBox="0 0 48 36" className="h-9 w-12" aria-hidden>
      <rect x="1" y="1" width="46" height="34" rx="6" fill="#D4AF37" stroke="#A8862A" strokeWidth="1.5" />
      <path d="M1 12h14M1 24h14M33 12h14M33 24h14M15 1v34M33 1v34M15 18h18" stroke="#A8862A" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/** Tarjeta con aspecto de tarjeta física (ISO 7810: 85.6 × 54 mm). Solo muestra los últimos 4 dígitos. */
export function CreditCardVisual({ kind, bank, alias, brand, last4, holder, color, balance, className }: Props) {
  return (
    <div
      className={cx('relative aspect-[1.586] w-full max-w-sm overflow-hidden rounded-2xl p-5 text-white shadow-[0_10px_30px_rgb(0_0_0/0.25)]', className)}
      style={{ background: color }}
      role="img"
      aria-label={`Tarjeta de ${kind === 'credito' ? 'crédito' : 'débito'} ${bank} terminación ${last4 || '----'}`}
    >
      {/* Formas sólidas translúcidas: dan relieve sin degradados */}
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-white/10" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-black/10" aria-hidden />

      <div className="relative flex h-full flex-col justify-between [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold leading-tight">{bank || 'Banco'}</p>
            <p className="truncate text-xs font-semibold uppercase tracking-wider opacity-90">
              {alias || (kind === 'credito' ? 'Crédito' : 'Débito')}
            </p>
          </div>
          <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">
            {kind === 'credito' ? 'Crédito' : 'Débito'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Chip />
          <Nfc className="size-6 opacity-90" aria-hidden />
          {balance !== undefined && (
            <span className="num ml-auto text-right text-sm font-bold">
              <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-90">
                {kind === 'credito' ? 'Saldo' : 'Disponible'}
              </span>
              {formatMXN(balance)}
            </span>
          )}
        </div>

        <p className="num font-mono text-lg font-bold tracking-[0.18em] sm:text-xl">
          •••• •••• •••• {last4 || '····'}
        </p>

        <div className="flex items-end justify-between gap-2">
          <p className="truncate text-xs font-semibold uppercase tracking-widest">{holder || 'Nombre del titular'}</p>
          <BrandMark brand={brand} />
        </div>
      </div>
    </div>
  );
}
