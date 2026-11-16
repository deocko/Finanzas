import { useState, type FormEvent } from 'react';
import { Info, Trash2 } from 'lucide-react';
import { INCOME_TYPES } from '../lib/catalog';
import { centsToInput, formatMXN, parseToCents } from '../lib/money';
import { todayISO } from '../lib/dates';
import {
  AGUINALDO_DIAS_MINIMOS, PRIMA_VACACIONAL_MINIMA, calcularAguinaldo, calcularPrimaVacacional, diasVacacionesLFT, salarioDiarioDesdeMensual,
} from '../lib/payroll';
import type { Income, IncomeType } from '../lib/types';
import { useData, useSettings, humanError } from '../data/DataContext';
import { Button, MoneyInput, Segmented, TextInput, useToast } from './ui';

export function IncomeForm({ initial, onDone, presetType }: { initial?: Income; presetType?: IncomeType; onDone: () => void }) {
  const { store } = useData();
  const settings = useSettings();
  const toast = useToast();
  const [type, setType] = useState<IncomeType>(initial?.type ?? presetType ?? 'sueldo');
  const [amount, setAmount] = useState(initial && !initial.calc ? centsToInput(initial.amount) : '');
  const [concept, setConcept] = useState(initial?.concept ?? '');
  const [date, setDate] = useState(initial?.date ?? todayISO());

  const defaultDaily = settings.salarioMensual ? salarioDiarioDesdeMensual(settings.salarioMensual) : 0;
  const [daily, setDaily] = useState(
    initial?.calc ? centsToInput(initial.calc.salarioDiario) : defaultDaily ? centsToInput(defaultDaily) : '',
  );
  const [diasAguinaldo, setDiasAguinaldo] = useState(String(initial?.type === 'aguinaldo' ? initial.calc?.dias ?? 15 : settings.diasAguinaldo));
  const [diasTrabajados, setDiasTrabajados] = useState(String(initial?.calc?.diasTrabajados ?? 365));
  const [antig, setAntig] = useState(String(settings.aniosAntiguedad || 1));
  const [diasVac, setDiasVac] = useState(String(initial?.type === 'prima' ? initial.calc?.dias ?? 12 : diasVacacionesLFT(settings.aniosAntiguedad || 1)));
  const [porcentaje, setPorcentaje] = useState(String(initial?.calc?.porcentaje ?? settings.primaPorcentaje ?? 25));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dailyCents = parseToCents(daily) ?? 0;
  const ag = calcularAguinaldo({
    salarioDiario: dailyCents,
    diasAguinaldo: Number(diasAguinaldo) || 0,
    diasTrabajados: Number(diasTrabajados) || 0,
  });
  const pr = calcularPrimaVacacional({ salarioDiario: dailyCents, diasVacaciones: Number(diasVac) || 0, porcentaje: Number(porcentaje) || 0 });

  const computed = type === 'aguinaldo' ? ag.monto : type === 'prima' ? pr.monto : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cents = computed ?? parseToCents(amount);
    if (cents === null || cents <= 0) {
      setError(computed !== null ? 'Captura el salario diario y los días para calcular el monto.' : 'Escribe un monto mayor a cero.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const data = {
        date,
        type,
        amount: cents,
        concept: concept.trim() || INCOME_TYPES[type].label,
        calc:
          type === 'aguinaldo'
            ? { salarioDiario: dailyCents, dias: ag.diasAplicados, diasTrabajados: Number(diasTrabajados) || 0 }
            : type === 'prima'
              ? { salarioDiario: dailyCents, dias: Number(diasVac) || 0, porcentaje: pr.porcentajeAplicado }
              : undefined,
      };
      if (initial) await store.update('incomes', initial.id, data);
      else await store.add('incomes', data);
      toast(initial ? 'Ingreso actualizado' : 'Ingreso registrado');
      onDone();
    } catch (err) {
      toast(humanError(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Segmented
        label="Tipo de ingreso"
        value={type}
        onChange={setType}
        options={[
          { value: 'sueldo', label: 'Sueldo' },
          { value: 'aguinaldo', label: 'Aguinaldo' },
          { value: 'prima', label: 'Prima vac.' },
          { value: 'otro', label: 'Otro' },
        ]}
      />

      {computed === null ? (
        <MoneyInput label="Monto" value={amount} onChange={setAmount} error={error} big autoFocus={!initial} />
      ) : (
        <>
          <MoneyInput
            label="Salario diario"
            value={daily}
            onChange={setDaily}
            hint={settings.salarioMensual ? `Calculado de tu sueldo mensual ÷ 30 (${formatMXN(settings.salarioMensual)}). Puedes cambiarlo.` : 'Tu sueldo mensual ÷ 30. Puedes guardarlo en Ajustes.'}
          />
          {type === 'aguinaldo' ? (
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                label="Días de aguinaldo"
                type="number"
                inputMode="numeric"
                min={AGUINALDO_DIAS_MINIMOS}
                value={diasAguinaldo}
                onChange={(e) => setDiasAguinaldo(e.target.value)}
                hint={`Mínimo legal: ${AGUINALDO_DIAS_MINIMOS} días`}
                error={ag.ajustadoAlMinimo ? `Se usan ${AGUINALDO_DIAS_MINIMOS} días (mínimo de ley)` : null}
              />
              <TextInput
                label="Días trabajados del año"
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                value={diasTrabajados}
                onChange={(e) => setDiasTrabajados(e.target.value)}
                hint="365 = año completo"
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <TextInput
                label="Antigüedad (años)"
                type="number"
                inputMode="numeric"
                min={1}
                value={antig}
                onChange={(e) => {
                  setAntig(e.target.value);
                  const d = diasVacacionesLFT(Number(e.target.value) || 0);
                  if (d) setDiasVac(String(d));
                }}
              />
              <TextInput label="Días de vacaciones" type="number" inputMode="numeric" min={0} value={diasVac} onChange={(e) => setDiasVac(e.target.value)} hint="Según LFT" />
              <TextInput
                label="Prima %"
                type="number"
                inputMode="numeric"
                min={PRIMA_VACACIONAL_MINIMA}
                value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
                hint="Mínimo 25 %"
              />
            </div>
          )}

          <div className="rounded-card bg-brand-soft p-4" aria-live="polite">
            <p className="text-sm font-semibold text-ink-2">{type === 'aguinaldo' ? 'Aguinaldo calculado' : 'Prima vacacional calculada'}</p>
            <p className="num text-3xl font-extrabold text-ink">{formatMXN(computed)}</p>
            <p className="num mt-1 text-xs text-ink-2">
              {type === 'aguinaldo'
                ? `${formatMXN(dailyCents)} × ${ag.diasAplicados} días${ag.proporcion < 1 ? ` × ${Number(diasTrabajados) || 0}/365` : ''}`
                : `${formatMXN(dailyCents)} × ${Number(diasVac) || 0} días × ${pr.porcentajeAplicado} %`}
            </p>
            {error && <p className="mt-2 text-xs font-semibold text-danger" role="alert">{error}</p>}
          </div>
          <p className="flex gap-2 text-xs text-muted">
            <Info className="size-4 shrink-0" aria-hidden />
            Cálculo bruto según la LFT (art. 87 aguinaldo, art. 76 y 80 vacaciones y prima). No descuenta ISR.
          </p>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={INCOME_TYPES[type].label} maxLength={80} />
        <TextInput label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
      </div>

      <Button type="submit" className="w-full" loading={saving}>Guardar ingreso</Button>
      {initial && (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-danger"
          onClick={async () => {
            if (!window.confirm('¿Eliminar este ingreso? No se puede deshacer.')) return;
            try {
              await store.remove('incomes', initial.id);
              toast('Ingreso eliminado');
              onDone();
            } catch (err) {
              toast(humanError(err), 'error');
            }
          }}
        >
          <Trash2 className="size-4" aria-hidden /> Eliminar ingreso
        </Button>
      )}
    </form>
  );
}
