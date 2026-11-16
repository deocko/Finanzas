import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { CATEGORIES, CATEGORY_ORDER, PAYMENT_METHODS } from '../lib/catalog';
import { centsToInput, parseToCents } from '../lib/money';
import { todayISO } from '../lib/dates';
import type { Expense, ExpenseCategory, PaymentMethod } from '../lib/types';
import { useCol, useData, humanError } from '../data/DataContext';
import { CATEGORY_ICONS } from './icons';
import { Button, MoneyInput, SelectInput, TextInput, cx, useToast } from './ui';

export interface ExpenseFormProps {
  initial?: Expense;
  presetCategory?: ExpenseCategory;
  onDone: () => void;
}

export function ExpenseForm({ initial, presetCategory, onDone }: ExpenseFormProps) {
  const { store } = useData();
  const cards = useCol('cards').items;
  const toast = useToast();
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amount) : '');
  const [category, setCategory] = useState<ExpenseCategory | null>(initial?.category ?? presetCategory ?? null);
  const [concept, setConcept] = useState(initial?.concept ?? '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [method, setMethod] = useState<PaymentMethod>(initial?.method ?? 'debito');
  const [cardId, setCardId] = useState(initial?.cardId ?? '');
  const [store_, setStore] = useState(initial?.store ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [keepTicket, setKeepTicket] = useState(!!initial?.ticketRef);
  const [errors, setErrors] = useState<{ amount?: string; category?: string }>({});
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const methodCards = cards.filter((c) => (method === 'credito' ? c.kind === 'credito' : method === 'debito' ? c.kind === 'debito' : false));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseToCents(amount);
    const errs: typeof errors = {};
    if (cents === null || cents <= 0) errs.amount = 'Escribe un monto mayor a cero.';
    if (!category) errs.category = 'Elige una categoría.';
    setErrors(errs);
    if (errs.amount || errs.category || cents === null || !category) return;

    setSaving(true);
    try {
      let ticketRef = keepTicket ? initial?.ticketRef : undefined;
      if (photo) {
        ticketRef = await store.saveTicket(photo);
      }
      if (initial?.ticketRef && initial.ticketRef !== ticketRef) {
        await store.deleteTicket(initial.ticketRef).catch(() => undefined);
      }
      const data = {
        date,
        concept: concept.trim() || CATEGORIES[category].label,
        amount: cents,
        category,
        method,
        cardId: methodCards.some((c) => c.id === cardId) ? cardId : undefined,
        store: category === 'despensa' && store_.trim() ? store_.trim() : undefined,
        ticketRef,
      };
      if (initial) await store.update('expenses', initial.id, data);
      else await store.add('expenses', data);
      toast(initial ? 'Gasto actualizado' : 'Gasto registrado');
      onDone();
    } catch (err) {
      toast(humanError(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <MoneyInput label="Monto" value={amount} onChange={setAmount} error={errors.amount} big autoFocus={!initial} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-2">Categoría</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup">
          {CATEGORY_ORDER.map((c) => {
            const Icon = CATEGORY_ICONS[c];
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCategory(c)}
                className={cx(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-control border-2 px-1 py-2 text-[11px] font-semibold leading-tight transition-colors',
                  active ? 'border-brand bg-brand-soft text-ink' : 'border-transparent bg-surface-2 text-ink-2 hover:border-line',
                )}
              >
                <span className="flex size-8 items-center justify-center rounded-full text-white" style={{ background: CATEGORIES[c].color }}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="line-clamp-2 text-center">{CATEGORIES[c].label.replace(' e internet', '')}</span>
              </button>
            );
          })}
        </div>
        {errors.category && <p className="mt-1 text-xs font-semibold text-danger" role="alert">{errors.category}</p>}
      </fieldset>

      <Button type="submit" className="w-full" loading={saving}>Guardar gasto</Button>

      <details className="group rounded-control border border-line" open={!!initial || category === 'despensa'}>
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-ink-2">
          Más detalles (concepto, fecha, método, ticket)
        </summary>
        <div className="space-y-4 border-t border-line p-3">
          <TextInput label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={category ? CATEGORIES[category].label : 'Ej. recibo de luz'} maxLength={80} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} required />
            <SelectInput label="Método de pago" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectInput>
          </div>
          {methodCards.length > 0 && (
            <SelectInput label="Tarjeta" value={cardId} onChange={(e) => setCardId(e.target.value)}>
              <option value="">Sin especificar</option>
              {methodCards.map((c) => <option key={c.id} value={c.id}>{c.alias || c.bank} •{c.last4}</option>)}
            </SelectInput>
          )}
          {category === 'despensa' && (
            <TextInput label="Tienda" value={store_} onChange={(e) => setStore(e.target.value)} placeholder="Ej. supermercado" maxLength={60} />
          )}

          <div>
            <p className="mb-1 text-sm font-semibold text-ink-2">Foto del ticket</p>
            {preview || keepTicket ? (
              <div className="flex items-center gap-3">
                {preview ? (
                  <img src={preview} alt="Vista previa del ticket" className="size-20 rounded-control object-cover" />
                ) : (
                  <span className="text-sm text-muted">Ticket guardado</span>
                )}
                <Button type="button" variant="ghost" onClick={() => { setPhoto(null); setKeepTicket(false); }}>
                  <Trash2 className="size-4" aria-hidden /> Quitar
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-line px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 focus-within:outline-3 focus-within:outline-brand">
                  <Camera className="size-4" aria-hidden /> Tomar foto
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-line px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 focus-within:outline-3 focus-within:outline-brand">
                  <ImagePlus className="size-4" aria-hidden /> Galería
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            )}
          </div>
          <Button type="submit" variant="secondary" className="w-full" loading={saving}>Guardar gasto</Button>
        </div>
      </details>
      {initial && (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-danger"
          onClick={async () => {
            if (!window.confirm('¿Eliminar este gasto? No se puede deshacer.')) return;
            try {
              await store.remove('expenses', initial.id);
              if (initial.ticketRef) await store.deleteTicket(initial.ticketRef).catch(() => undefined);
              toast('Gasto eliminado');
              onDone();
            } catch (err) {
              toast(humanError(err), 'error');
            }
          }}
        >
          <Trash2 className="size-4" aria-hidden /> Eliminar gasto
        </Button>
      )}
    </form>
  );
}
