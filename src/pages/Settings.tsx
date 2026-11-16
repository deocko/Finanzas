import { useEffect, useState, type FormEvent } from 'react';
import { Database, FileJson, FileSpreadsheet, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { useData, useSettings, humanError } from '../data/DataContext';
import { firebaseConfigured, ticketBackend } from '../data/firebaseConfig';
import { CATEGORIES, INCOME_TYPES, PAYMENT_METHODS } from '../lib/catalog';
import { centsToCSV, downloadText, toCSV } from '../lib/csv';
import { todayISO } from '../lib/dates';
import { centsToInput, formatMXN, parseToCents } from '../lib/money';
import { calcularAguinaldo, calcularPrimaVacacional, diasVacacionesLFT, salarioDiarioDesdeMensual } from '../lib/payroll';
import { COLLECTIONS, SETTINGS_ID } from '../lib/types';
import { Button, MoneyInput, PageHeader, Panel, TextInput, useToast } from '../components/ui';

export function SettingsPage({ onResetDemo }: { onResetDemo?: (withExamples: boolean) => void }) {
  const { store, data, exit, userLabel } = useData();
  const settings = useSettings();
  const toast = useToast();
  const [salario, setSalario] = useState(settings.salarioMensual ? centsToInput(settings.salarioMensual) : '');
  const [dias, setDias] = useState(String(settings.diasAguinaldo));
  const [antig, setAntig] = useState(String(settings.aniosAntiguedad));
  const [prima, setPrima] = useState(String(settings.primaPorcentaje));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSalario(settings.salarioMensual ? centsToInput(settings.salarioMensual) : '');
    setDias(String(settings.diasAguinaldo));
    setAntig(String(settings.aniosAntiguedad));
    setPrima(String(settings.primaPorcentaje));
  }, [settings.salarioMensual, settings.diasAguinaldo, settings.aniosAntiguedad, settings.primaPorcentaje]);

  const mensual = parseToCents(salario) ?? 0;
  const diario = salarioDiarioDesdeMensual(mensual);
  const ag = calcularAguinaldo({ salarioDiario: diario, diasAguinaldo: Number(dias) || 0 });
  const diasVac = diasVacacionesLFT(Number(antig) || 0);
  const pr = calcularPrimaVacacional({ salarioDiario: diario, diasVacaciones: diasVac, porcentaje: Number(prima) || 0 });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await store.set('settings', SETTINGS_ID, {
        salarioMensual: mensual,
        diasAguinaldo: Math.max(15, Number(dias) || 15),
        aniosAntiguedad: Math.max(0, Number(antig) || 0),
        primaPorcentaje: Math.max(25, Number(prima) || 25),
      });
      toast('Prestaciones guardadas');
    } catch (err) {
      toast(humanError(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  function exportJSON() {
    const payload = {
      app: 'finanzas',
      version: 1,
      exportedAt: new Date().toISOString(),
      moneda: 'MXN',
      nota: 'Montos en centavos (100 = $1.00).',
      ...Object.fromEntries(COLLECTIONS.map((c) => [c, data[c].items])),
    };
    downloadText(`respaldo-finanzas-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  }

  function exportAllCSV() {
    downloadText(
      `gastos-todos-${todayISO()}.csv`,
      toCSV(['Fecha', 'Concepto', 'Categoría', 'Método', 'Tienda', 'Monto MXN'], [...data.expenses.items].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => [e.date, e.concept, CATEGORIES[e.category].label, PAYMENT_METHODS[e.method], e.store ?? '', centsToCSV(e.amount)])),
    );
    downloadText(
      `ingresos-todos-${todayISO()}.csv`,
      toCSV(['Fecha', 'Concepto', 'Tipo', 'Monto MXN'], [...data.incomes.items].sort((a, b) => (a.date < b.date ? -1 : 1)).map((i) => [i.date, i.concept, INCOME_TYPES[i.type].label, centsToCSV(i.amount)])),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" subtitle="Prestaciones, respaldo y cuenta." />

      <Panel title="Mis prestaciones">
        <form onSubmit={save} className="space-y-4">
          <MoneyInput label="Sueldo mensual bruto" value={salario} onChange={setSalario} hint={mensual ? `Salario diario: ${formatMXN(diario)} (mensual ÷ 30)` : 'Se usa para calcular aguinaldo y prima vacacional.'} />
          <div className="grid grid-cols-3 gap-3">
            <TextInput label="Días de aguinaldo" type="number" inputMode="numeric" min={15} value={dias} onChange={(e) => setDias(e.target.value)} hint="Mínimo 15" />
            <TextInput label="Antigüedad (años)" type="number" inputMode="numeric" min={0} value={antig} onChange={(e) => setAntig(e.target.value)} hint={`${diasVac} días de vacaciones`} />
            <TextInput label="Prima vacacional %" type="number" inputMode="numeric" min={25} value={prima} onChange={(e) => setPrima(e.target.value)} hint="Mínimo 25 %" />
          </div>
          {mensual > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-control bg-surface-2 p-3">
                <p className="text-xs font-semibold text-muted">Aguinaldo estimado ({ag.diasAplicados} días)</p>
                <p className="num text-xl font-extrabold text-ink">{formatMXN(ag.monto)}</p>
              </div>
              <div className="rounded-control bg-surface-2 p-3">
                <p className="text-xs font-semibold text-muted">Prima vacacional ({diasVac} días × {pr.porcentajeAplicado} %)</p>
                <p className="num text-xl font-extrabold text-ink">{formatMXN(pr.monto)}</p>
              </div>
            </div>
          )}
          <Button type="submit" loading={saving}>Guardar prestaciones</Button>
        </form>
      </Panel>

      <Panel title="Respaldo de datos">
        <p className="mb-4 text-sm text-muted">Descarga todos tus datos. El JSON es un respaldo completo; el CSV se abre en Excel o Google Sheets.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={exportJSON}><FileJson className="size-4" aria-hidden /> Respaldo completo (JSON)</Button>
          <Button variant="secondary" onClick={exportAllCSV}><FileSpreadsheet className="size-4" aria-hidden /> Ingresos y gastos (CSV)</Button>
        </div>
      </Panel>

      <Panel title="Cuenta y seguridad">
        <ul className="space-y-3 text-sm text-ink-2">
          <li className="flex gap-2"><ShieldCheck className="size-5 shrink-0 text-ok" aria-hidden />
            {store.mode === 'demo'
              ? 'Modo demo: los datos de ejemplo viven solo en este navegador, no se envían a ningún servidor.'
              : `Sesión iniciada como ${userLabel ?? 'usuario autorizado'}. Solo tu cuenta puede leer y escribir tus datos (reglas de Firestore y Storage).`}
          </li>
          <li className="flex gap-2"><Database className="size-5 shrink-0 text-brand" aria-hidden />
            {firebaseConfigured ? `Firebase configurado. Fotos de tickets en ${ticketBackend === 'storage' ? 'Firebase Storage' : 'Firestore (comprimidas)'}.` : 'Firebase aún no está configurado: revisa el README (sección «Configurar Firebase»).'}
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          {store.mode === 'demo' && onResetDemo && (
            <>
              <Button variant="secondary" onClick={() => window.confirm('¿Borrar los datos de ejemplo y empezar en blanco?') && onResetDemo(false)}>
                <Trash2 className="size-4" aria-hidden /> Empezar en blanco
              </Button>
              <Button variant="secondary" onClick={() => onResetDemo(true)}>Restaurar datos de ejemplo</Button>
            </>
          )}
          {exit && (
            <Button variant="secondary" onClick={exit}>
              <LogOut className="size-4" aria-hidden /> {store.mode === 'demo' ? 'Salir de la demo' : 'Cerrar sesión'}
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
