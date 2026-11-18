import { useEffect, useState, type FormEvent } from 'react';
import { useCol, useData, useHabits, humanError } from '../data/DataContext';
import { CATEGORIES, CATEGORY_ORDER } from '../lib/catalog';
import { centsToInput, formatMXN, parseToCents } from '../lib/money';
import { DEFAULT_HABITS, essentialMonthly } from '../lib/health';
import { todayISO } from '../lib/dates';
import { HABITS_ID, type ExpenseCategory, type SpendGroup } from '../lib/types';
import { Button, MoneyInput, SelectInput, TextInput, useToast } from './ui';

/** Hábitos y salud financiera: todo editable por Diego. Nada se ejecuta solo. */
export function HabitsForm() {
  const { store } = useData();
  const habits = useHabits();
  const accounts = useCol('accounts').items;
  const expenses = useCol('expenses').items;
  const toast = useToast();

  const [needs, setNeeds] = useState(String(habits.needsPct));
  const [wants, setWants] = useState(String(habits.wantsPct));
  const [savings, setSavings] = useState(String(habits.savingsPct));
  const [groups, setGroups] = useState(habits.categoryGroups);
  const [months, setMonths] = useState(String(habits.emergencyMonths));
  const [horizon, setHorizon] = useState(String(habits.emergencyHorizonMonths));
  const [fundAccount, setFundAccount] = useState(habits.emergencyAccountId ?? '');
  const [essential, setEssential] = useState(habits.essentialMonthlyOverride ? centsToInput(habits.essentialMonthlyOverride) : '');
  const [impulse, setImpulse] = useState(habits.impulseThreshold ? centsToInput(habits.impulseThreshold) : '');
  const [renewal, setRenewal] = useState(String(habits.renewalNoticeDays));
  const [budgets, setBudgets] = useState<Partial<Record<ExpenseCategory, string>>>(() =>
    Object.fromEntries(Object.entries(habits.budgets).map(([k, v]) => [k, v ? centsToInput(v) : ''])),
  );
  const [rulesOn, setRulesOn] = useState(habits.merchantRulesEnabled);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Si llegan los datos guardados después del primer render, refleja sus valores.
  useEffect(() => {
    setNeeds(String(habits.needsPct));
    setWants(String(habits.wantsPct));
    setSavings(String(habits.savingsPct));
    setGroups(habits.categoryGroups);
    setMonths(String(habits.emergencyMonths));
    setHorizon(String(habits.emergencyHorizonMonths));
    setFundAccount(habits.emergencyAccountId ?? '');
    setEssential(habits.essentialMonthlyOverride ? centsToInput(habits.essentialMonthlyOverride) : '');
    setImpulse(habits.impulseThreshold ? centsToInput(habits.impulseThreshold) : '');
    setRenewal(String(habits.renewalNoticeDays));
    setBudgets(Object.fromEntries(Object.entries(habits.budgets).map(([k, v]) => [k, v ? centsToInput(v) : ''])));
    setRulesOn(habits.merchantRulesEnabled);
  }, [habits]);

  const sum = (Number(needs) || 0) + (Number(wants) || 0) + (Number(savings) || 0);
  const computedEssential = essentialMonthly(expenses, { ...habits, categoryGroups: groups, essentialMonthlyOverride: undefined }, todayISO());

  async function save(e: FormEvent) {
    e.preventDefault();
    if (sum !== 100) return setError(`Los tres porcentajes deben sumar 100 % (ahora suman ${sum} %).`);
    const m = Number(months);
    if (!(m >= 3 && m <= 6)) return setError('La meta del fondo de emergencia va de 3 a 6 meses.');
    const parsedBudgets: Partial<Record<ExpenseCategory, number>> = {};
    for (const [k, v] of Object.entries(budgets)) {
      if (!v?.trim()) continue;
      const c = parseToCents(v);
      if (c === null || c < 0) return setError(`Presupuesto inválido en ${CATEGORIES[k as ExpenseCategory].label}.`);
      if (c > 0) parsedBudgets[k as ExpenseCategory] = c;
    }
    const ess = essential.trim() ? parseToCents(essential) : null;
    const imp = impulse.trim() ? parseToCents(impulse) : 0;
    if (imp === null) return setError('Monto de la regla de 24 horas inválido.');
    setError(null);
    setSaving(true);
    try {
      await store.set('habits', HABITS_ID, {
        needsPct: Number(needs), wantsPct: Number(wants), savingsPct: Number(savings),
        categoryGroups: groups,
        emergencyMonths: m,
        emergencyHorizonMonths: Math.max(1, Math.round(Number(horizon) || DEFAULT_HABITS.emergencyHorizonMonths)),
        emergencyAccountId: fundAccount || undefined,
        essentialMonthlyOverride: ess && ess > 0 ? ess : undefined,
        impulseThreshold: imp,
        budgets: parsedBudgets,
        renewalNoticeDays: Math.max(0, Math.round(Number(renewal) || 0)),
        merchantRulesEnabled: rulesOn,
      });
      toast('Hábitos guardados');
    } catch (err) {
      toast(humanError(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <fieldset className="space-y-3">
        <legend className="text-base font-bold text-ink">Regla 50/30/20</legend>
        <div className="grid grid-cols-3 gap-3">
          <TextInput label="Necesidades %" type="number" inputMode="numeric" min={0} max={100} value={needs} onChange={(e) => setNeeds(e.target.value)} />
          <TextInput label="Deseos %" type="number" inputMode="numeric" min={0} max={100} value={wants} onChange={(e) => setWants(e.target.value)} />
          <TextInput label="Ahorro %" type="number" inputMode="numeric" min={0} max={100} value={savings} onChange={(e) => setSavings(e.target.value)} hint="También es el % de «Págate primero»" />
        </div>
        <details className="rounded-control border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-ink-2">¿Qué categorías son necesidad y cuáles deseo?</summary>
          <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
            {CATEGORY_ORDER.map((c) => (
              <label key={c} className="flex items-center justify-between gap-2 text-sm text-ink">
                {CATEGORIES[c].label}
                <select className="min-h-11 rounded-control border border-line bg-surface px-2 text-sm" value={groups[c]} onChange={(e) => setGroups({ ...groups, [c]: e.target.value as SpendGroup })}>
                  <option value="necesidad">Necesidad</option>
                  <option value="deseo">Deseo</option>
                </select>
              </label>
            ))}
          </div>
        </details>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-bold text-ink">Fondo de emergencia</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label="Meta (meses de gasto esencial)" type="number" inputMode="numeric" min={3} max={6} value={months} onChange={(e) => setMonths(e.target.value)} hint="De 3 a 6" />
          <TextInput label="Alcanzarla en (meses)" type="number" inputMode="numeric" min={1} value={horizon} onChange={(e) => setHorizon(e.target.value)} hint="Para sugerir el aporte mensual" />
          <SelectInput label="Cuenta del fondo" value={fundAccount} onChange={(e) => setFundAccount(e.target.value)} hint={accounts.length ? undefined : 'Primero registra la cuenta en Cuentas'}>
            <option value="">Sin elegir</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectInput>
        </div>
        <MoneyInput
          label="Gasto esencial mensual (opcional)"
          value={essential}
          onChange={setEssential}
          hint={computedEssential.amount ? `Si lo dejas vacío se usa el promedio de tus necesidades: ${formatMXN(computedEssential.amount)} (${computedEssential.months} ${computedEssential.months === 1 ? 'mes' : 'meses'}).` : 'Si lo dejas vacío se calcula con tus gastos de necesidades de los últimos 3 meses.'}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-bold text-ink">Hábitos y alertas</legend>
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput label="Regla de 24 h: compras no esenciales mayores a" value={impulse} onChange={setImpulse} hint="Vacío = apagada" />
          <TextInput label="Avisar renovaciones con (días)" type="number" inputMode="numeric" min={0} value={renewal} onChange={(e) => setRenewal(e.target.value)} />
        </div>
        <details className="rounded-control border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-ink-2">Presupuesto mensual por categoría (alerta al 80 % y al excederse)</summary>
          <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
            {CATEGORY_ORDER.map((c) => (
              <MoneyInput key={c} label={CATEGORIES[c].label} value={budgets[c] ?? ''} onChange={(v) => setBudgets({ ...budgets, [c]: v })} />
            ))}
          </div>
        </details>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--color-brand)]" checked={rulesOn} onChange={(e) => setRulesOn(e.target.checked)} />
          <span>
            <span className="font-semibold">Reglas por comercio</span>
            <span className="block text-xs text-muted">Al confirmar un comercio, los siguientes gastos de ese comercio toman la misma categoría. La auto-confirmación se enciende aparte, comercio por comercio, en Importar.</span>
          </span>
        </label>
      </fieldset>

      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <Button type="submit" loading={saving}>Guardar hábitos</Button>
    </form>
  );
}
