import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { BRANDS, CARD_COLORS, CATEGORIES, CATEGORY_ORDER, COINS } from '../lib/catalog';
import { centsToInput, parseToCents } from '../lib/money';
import { todayISO } from '../lib/dates';
import type { Bill, Card, CardBrand, CryptoHolding, ExpenseCategory, Fund } from '../lib/types';
import { useData, humanError } from '../data/DataContext';
import { CreditCardVisual } from './CreditCardVisual';
import { Button, MoneyInput, Segmented, SelectInput, TextInput, cx, useToast } from './ui';

function useSave(onDone: () => void) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setSaving(true);
    try {
      await fn();
      toast(msg);
      onDone();
    } catch (e) {
      toast(humanError(e), 'error');
    } finally {
      setSaving(false);
    }
  };
  return { saving, run };
}

const optCents = (s: string): number | undefined => {
  const v = parseToCents(s);
  return v === null ? undefined : v;
};

const dayOk = (s: string) => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 31;
};

// ---------- Tarjeta ----------

export function CardForm({ initial, onDone }: { initial?: Card; onDone: () => void }) {
  const { store } = useData();
  const { saving, run } = useSave(onDone);
  const [kind, setKind] = useState<Card['kind']>(initial?.kind ?? 'credito');
  const [bank, setBank] = useState(initial?.bank ?? '');
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [brand, setBrand] = useState<CardBrand>(initial?.brand ?? 'visa');
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [holder, setHolder] = useState(initial?.holder ?? '');
  const [color, setColor] = useState(initial?.color ?? CARD_COLORS[0]!.value);
  const [balance, setBalance] = useState(initial ? centsToInput(initial.balance) : '');
  const [limit, setLimit] = useState(initial?.creditLimit !== undefined ? centsToInput(initial.creditLimit) : '');
  const [cutDay, setCutDay] = useState(initial?.cutDay ? String(initial.cutDay) : '');
  const [dueDay, setDueDay] = useState(initial?.dueDay ? String(initial.dueDay) : '');
  const [minPay, setMinPay] = useState(initial?.minPayment !== undefined ? centsToInput(initial.minPayment) : '');
  const [noInt, setNoInt] = useState(initial?.noInterestPayment !== undefined ? centsToInput(initial.noInterestPayment) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Solo dígitos y SOLO los últimos 4: si alguien pega el número completo, se descarta el resto al instante. */
  const onLast4 = (v: string) => setLast4(v.replace(/\D/g, '').slice(-4));

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!bank.trim()) errs.bank = 'Escribe el banco.';
    if (!/^\d{4}$/.test(last4)) errs.last4 = 'Escribe exactamente 4 dígitos.';
    if (parseToCents(balance || '0') === null) errs.balance = 'Monto no válido.';
    if (kind === 'credito') {
      if (cutDay && !dayOk(cutDay)) errs.cutDay = 'Día entre 1 y 31.';
      if (!dayOk(dueDay)) errs.dueDay = 'Día entre 1 y 31.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const data = {
      kind,
      bank: bank.trim(),
      alias: alias.trim(),
      brand,
      last4,
      holder: holder.trim().toUpperCase(),
      color,
      balance: parseToCents(balance || '0') ?? 0,
      ...(kind === 'credito'
        ? {
            creditLimit: optCents(limit),
            cutDay: cutDay ? Number(cutDay) : undefined,
            dueDay: Number(dueDay),
            minPayment: optCents(minPay),
            noInterestPayment: optCents(noInt),
            paidPeriods: initial?.paidPeriods ?? [],
          }
        : { creditLimit: undefined, cutDay: undefined, dueDay: undefined, minPayment: undefined, noInterestPayment: undefined }),
    };
    void run(() => (initial ? store.update('cards', initial.id, data) : store.add('cards', data)), initial ? 'Tarjeta actualizada' : 'Tarjeta agregada');
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex justify-center">
        <CreditCardVisual kind={kind} bank={bank} alias={alias} brand={brand} last4={last4} holder={holder.toUpperCase()} color={color} />
      </div>
      <p className="flex items-start gap-2 rounded-control bg-ok-soft p-3 text-xs font-semibold text-ink">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        Por seguridad solo se guardan los últimos 4 dígitos. Nunca escribas el número completo, CVV ni NIP.
      </p>
      <Segmented label="Tipo" value={kind} onChange={setKind} options={[{ value: 'credito', label: 'Crédito' }, { value: 'debito', label: 'Débito' }]} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Banco" value={bank} onChange={(e) => setBank(e.target.value)} error={errors.bank} maxLength={30} autoFocus={!initial} />
        <TextInput label="Nombre de la tarjeta" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ej. Oro" maxLength={30} />
        <SelectInput label="Marca" value={brand} onChange={(e) => setBrand(e.target.value as CardBrand)}>
          {Object.entries(BRANDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectInput>
        <TextInput
          label="Últimos 4 dígitos"
          inputMode="numeric"
          autoComplete="off"
          value={last4}
          onChange={(e) => onLast4(e.target.value)}
          error={errors.last4}
          placeholder="1234"
          className="num tracking-widest"
        />
      </div>
      <TextInput label="Nombre del titular" value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={40} autoComplete="off" />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-2">Color del banco</legend>
        <div className="flex flex-wrap gap-2">
          {CARD_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.name}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
              className={cx('size-11 rounded-full border-4', color === c.value ? 'border-brand' : 'border-surface')}
              style={{ background: c.value }}
            />
          ))}
        </div>
      </fieldset>
      <MoneyInput label={kind === 'credito' ? 'Saldo actual (lo que debes)' : 'Saldo disponible'} value={balance} onChange={setBalance} error={errors.balance} />
      {kind === 'credito' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Límite de crédito" value={limit} onChange={setLimit} />
            <MoneyInput label="Pago mínimo" value={minPay} onChange={setMinPay} />
          </div>
          <MoneyInput label="Pago para no generar intereses" value={noInt} onChange={setNoInt} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Día de corte" type="number" inputMode="numeric" min={1} max={31} value={cutDay} onChange={(e) => setCutDay(e.target.value)} error={errors.cutDay} hint="Día del mes" />
            <TextInput label="Día límite de pago" type="number" inputMode="numeric" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} error={errors.dueDay} hint="Día del mes" />
          </div>
        </>
      )}
      <Button type="submit" className="w-full" loading={saving}>{initial ? 'Guardar cambios' : 'Agregar tarjeta'}</Button>
    </form>
  );
}

// ---------- Pago recurrente / vencimiento ----------

export function BillForm({ initial, onDone }: { initial?: Bill; onDone: () => void }) {
  const { store } = useData();
  const { saving, run } = useSave(onDone);
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(initial?.category ?? 'luz');
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amount) : '');
  const [recurrence, setRecurrence] = useState<Bill['recurrence']>(initial?.recurrence ?? 'mensual');
  const [dueDay, setDueDay] = useState(initial?.dueDay ? String(initial.dueDay) : '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseToCents(amount);
    const errs: Record<string, string> = {};
    if (cents === null || cents < 0) errs.amount = 'Escribe un monto válido.';
    if (recurrence === 'mensual' && !dayOk(dueDay)) errs.dueDay = 'Día entre 1 y 31.';
    setErrors(errs);
    if (Object.keys(errs).length || cents === null) return;
    const data = {
      name: name.trim() || CATEGORIES[category].label,
      category,
      amount: cents,
      recurrence,
      dueDay: recurrence === 'mensual' ? Number(dueDay) : undefined,
      date: recurrence === 'unico' ? date : undefined,
      paidPeriods: initial?.paidPeriods ?? [],
    };
    void run(() => (initial ? store.update('bills', initial.id, data) : store.add('bills', data)), initial ? 'Pago actualizado' : 'Vencimiento agregado');
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SelectInput label="Categoría" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
        {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
      </SelectInput>
      <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder={CATEGORIES[category].label} maxLength={60} />
      <MoneyInput label="Monto aproximado" value={amount} onChange={setAmount} error={errors.amount} />
      <Segmented label="Se repite" value={recurrence} onChange={setRecurrence} options={[{ value: 'mensual', label: 'Cada mes' }, { value: 'unico', label: 'Una vez' }]} />
      {recurrence === 'mensual' ? (
        <TextInput label="Día del mes en que vence" type="number" inputMode="numeric" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} error={errors.dueDay} hint="Si el mes es más corto, se toma el último día." />
      ) : (
        <TextInput label="Fecha de vencimiento" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
      )}
      <Button type="submit" className="w-full" loading={saving}>{initial ? 'Guardar cambios' : 'Agregar vencimiento'}</Button>
    </form>
  );
}

// ---------- Cripto ----------

export function CryptoForm({ initial, onDone }: { initial?: CryptoHolding; onDone: () => void }) {
  const { store } = useData();
  const { saving, run } = useSave(onDone);
  const initialKnown = !initial || COINS.some((c) => c.id === initial.coinId);
  const [coinId, setCoinId] = useState(initial ? (initialKnown ? initial.coinId : '__otra') : 'bitcoin');
  const [custom, setCustom] = useState(initial && !initialKnown ? initial.coinId : '');
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : '');
  const [buyPrice, setBuyPrice] = useState(initial ? centsToInput(initial.buyPrice) : '');
  const [buyDate, setBuyDate] = useState(initial?.buyDate ?? todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = Number(quantity.replace(',', '.'));
    const p = parseToCents(buyPrice);
    const id = coinId === '__otra' ? custom.trim().toLowerCase() : coinId;
    const errs: Record<string, string> = {};
    if (!(q > 0)) errs.quantity = 'Cantidad mayor a cero.';
    if (p === null || p < 0) errs.buyPrice = 'Precio no válido.';
    if (!id) errs.custom = 'Escribe el id de CoinGecko (p. ej. "polkadot").';
    setErrors(errs);
    if (Object.keys(errs).length || p === null) return;
    const meta = COINS.find((c) => c.id === id);
    const data = { coinId: id, symbol: meta?.symbol ?? id.slice(0, 5).toUpperCase(), name: meta?.name ?? id, quantity: q, buyPrice: p, buyDate };
    void run(() => (initial ? store.update('crypto', initial.id, data) : store.add('crypto', data)), initial ? 'Tenencia actualizada' : 'Tenencia agregada');
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SelectInput label="Moneda" value={coinId} onChange={(e) => setCoinId(e.target.value)}>
        {COINS.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.symbol})</option>)}
        <option value="__otra">Otra…</option>
      </SelectInput>
      {coinId === '__otra' && (
        <TextInput label="Id en CoinGecko" value={custom} onChange={(e) => setCustom(e.target.value)} error={errors.custom} hint="Aparece en la URL de la moneda en coingecko.com" />
      )}
      <TextInput label="Cantidad" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.,]/g, ''))} error={errors.quantity} placeholder="0.0125" className="num" />
      <MoneyInput label="Precio de compra por unidad (MXN)" value={buyPrice} onChange={setBuyPrice} error={errors.buyPrice} />
      <TextInput label="Fecha de compra" type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value || todayISO())} />
      <Button type="submit" className="w-full" loading={saving}>{initial ? 'Guardar cambios' : 'Agregar'}</Button>
    </form>
  );
}

// ---------- Fondo de inversión ----------

export function FundForm({ initial, onDone }: { initial?: Fund; onDone: () => void }) {
  const { store } = useData();
  const { saving, run } = useSave(onDone);
  const [name, setName] = useState(initial?.name ?? '');
  const [institution, setInstitution] = useState(initial?.institution ?? '');
  const [invested, setInvested] = useState(initial ? centsToInput(initial.invested) : '');
  const [current, setCurrent] = useState(initial ? centsToInput(initial.currentValue) : '');
  const [yld, setYld] = useState(initial ? String(initial.reportedYield) : '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const inv = parseToCents(invested);
    const cur = parseToCents(current || invested);
    const y = yld.trim() === '' ? 0 : Number(yld.replace(',', '.'));
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Escribe el nombre del fondo.';
    if (inv === null || inv < 0) errs.invested = 'Monto no válido.';
    if (cur === null || cur < 0) errs.current = 'Monto no válido.';
    if (!Number.isFinite(y)) errs.yld = 'Porcentaje no válido.';
    setErrors(errs);
    if (Object.keys(errs).length || inv === null || cur === null) return;
    const data = { name: name.trim(), institution: institution.trim(), invested: inv, currentValue: cur, reportedYield: y, date };
    void run(() => (initial ? store.update('funds', initial.id, data) : store.add('funds', data)), initial ? 'Fondo actualizado' : 'Fondo agregado');
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextInput label="Fondo" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={60} autoFocus={!initial} />
      <TextInput label="Institución" value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={60} />
      <div className="grid grid-cols-2 gap-3">
        <MoneyInput label="Monto invertido" value={invested} onChange={setInvested} error={errors.invested} />
        <MoneyInput label="Valor actual" value={current} onChange={setCurrent} error={errors.current} hint="Del estado de cuenta" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Rendimiento anual reportado %" inputMode="decimal" value={yld} onChange={(e) => setYld(e.target.value)} error={errors.yld} className="num" />
        <TextInput label="Fecha del dato" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
      </div>
      <Button type="submit" className="w-full" loading={saving}>{initial ? 'Guardar cambios' : 'Agregar fondo'}</Button>
    </form>
  );
}
