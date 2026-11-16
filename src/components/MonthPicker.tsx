import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, formatPeriod, periodOf, todayISO, type Period } from '../lib/dates';
import { IconButton } from './ui';

export function MonthPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const isCurrent = value >= periodOf(todayISO());
  return (
    <div className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-card">
      <IconButton label="Mes anterior" onClick={() => onChange(addMonths(value, -1))}><ChevronLeft className="size-5" aria-hidden /></IconButton>
      <span className="min-w-32 text-center text-sm font-bold capitalize text-ink" aria-live="polite">{formatPeriod(value, true)}</span>
      <IconButton label="Mes siguiente" onClick={() => onChange(addMonths(value, 1))} disabled={isCurrent} className="disabled:opacity-30">
        <ChevronRight className="size-5" aria-hidden />
      </IconButton>
    </div>
  );
}
