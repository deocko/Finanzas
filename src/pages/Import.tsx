import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, FileUp, History, Inbox, MailCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useCol, useData, useHabits, humanError } from '../data/DataContext';
import { confirmItem, discardItem, importParsed } from '../data/ingestActions';
import { CATEGORIES, CATEGORY_ORDER } from '../lib/catalog';
import { formatDate } from '../lib/dates';
import { centsToInput, formatMXN, parseToCents } from '../lib/money';
import { INGEST_TYPE_LABELS, dedupeById, parseIngest, type IngestParseResult } from '../lib/ingest';
import { chargeOfExpense, chargeOfInbox, possibleDuplicates, unusualCharge, type Charge } from '../lib/alerts';
import type { ExpenseCategory, InboxItem } from '../lib/types';
import { Button, EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, cx, useToast } from '../components/ui';

interface RowEdit {
  category?: ExpenseCategory;
  amount?: string;
  accountId?: string;
}

export function ImportPage() {
  const { store, retry } = useData();
  const inbox = useCol('inbox');
  const imports = useCol('imports').items;
  const accounts = useCol('accounts').items;
  const rules = useCol('merchantRules').items;
  const expenses = useCol('expenses').items;
  const habits = useHabits();
  const toast = useToast();

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<IngestParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const knownIds = useMemo(() => inbox.items.map((i) => i.extId), [inbox.items]);
  const preview = useMemo(() => (parsed?.ok ? dedupeById(parsed.expenses, knownIds) : null), [parsed, knownIds]);

  const pending = useMemo(
    () => inbox.items.filter((i) => i.status === 'pendiente').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [inbox.items],
  );

  // Señales por renglón: posible duplicado o cargo inusual
  const flags = useMemo(() => {
    const history: Charge[] = [
      ...expenses.map(chargeOfExpense).filter((c): c is Charge => c !== null),
      ...pending.filter((p) => p.direction === 'salida').map(chargeOfInbox),
    ];
    const dup = new Set(possibleDuplicates(history).flatMap(([a, b]) => [a.ref, b.ref]));
    const out = new Map<string, { duplicate: boolean; unusual: number | null }>();
    for (const p of pending) {
      const c = chargeOfInbox(p);
      const u = p.direction === 'salida' ? unusualCharge(c, history) : { unusual: false, average: 0 };
      out.set(p.id, { duplicate: dup.has(c.ref), unusual: u.unusual ? u.average : null });
    }
    return out;
  }, [expenses, pending]);

  function review(raw: string) {
    setText(raw);
    setParsed(raw.trim() ? parseIngest(raw) : null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000) {
      toast('El archivo es demasiado grande (máximo 5 MB).', 'error');
      return;
    }
    review(await file.text());
  }

  async function doImport() {
    if (!parsed?.ok) return;
    setBusy(true);
    try {
      const r = await importParsed(store, parsed, { inbox: inbox.items, accounts, rules: [...rules], habits, expenses });
      toast(`${r.nuevos} pendientes de confirmar · ${r.duplicados} duplicados${r.autoConfirmados ? ` · ${r.autoConfirmados} auto-confirmados` : ''}`);
      setText('');
      setParsed(null);
    } catch (e) {
      toast(humanError(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  function editsFor(item: InboxItem) {
    const e = edits[item.id] ?? {};
    const amount = e.amount === undefined ? undefined : parseToCents(e.amount);
    return {
      category: e.category,
      amount: amount ?? undefined,
      accountId: e.accountId === undefined ? undefined : e.accountId === '' ? null : e.accountId,
      invalid: e.amount !== undefined && (amount == null || amount <= 0),
    };
  }

  async function confirm(items: InboxItem[]) {
    setBusy(true);
    const ctx = { accounts, rules: [...rules], habits };
    let ok = 0;
    try {
      for (const it of items) {
        const e = editsFor(it);
        if (e.invalid) {
          toast(`Monto inválido en ${it.merchant}`, 'error');
          continue;
        }
        await confirmItem(store, it, e, ctx);
        ok++;
      }
      if (ok) toast(ok === 1 ? 'Movimiento confirmado' : `${ok} movimientos confirmados`);
      setSelected(new Set());
    } catch (e) {
      toast(humanError(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function discard(items: InboxItem[]) {
    setBusy(true);
    try {
      for (const it of items) await discardItem(store, it);
      toast(items.length === 1 ? 'Descartado' : `${items.length} descartados`);
      setSelected(new Set());
    } catch (e) {
      toast(humanError(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const history = useMemo(
    () =>
      [...imports]
        .sort((a, b) => b.date - a.date)
        .map((imp) => {
          const its = inbox.items.filter((i) => i.importId === imp.id);
          return {
            imp,
            confirmados: its.filter((i) => i.status === 'confirmado').length,
            descartados: its.filter((i) => i.status === 'descartado').length,
            pendientes: its.filter((i) => i.status === 'pendiente').length,
          };
        }),
    [imports, inbox.items],
  );

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name;
  const selectedItems = pending.filter((p) => selected.has(p.id));

  if (inbox.error) return <ErrorState message={inbox.error} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar"
        subtitle="Gastos que Byte detectó en tu Gmail y Outlook. Nada se registra sin que lo confirmes."
        action={<Link to="/cuentas" className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand">Cuentas</Link>}
      />

      <Panel title="1. Pega o carga el JSON de Byte">
        <div className="space-y-3">
          <label htmlFor="ingest-json" className="block text-sm font-semibold text-ink-2">JSON (esquema versión 1)</label>
          <textarea
            id="ingest-json"
            value={text}
            onChange={(e) => review(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder='{ "version": 1, "source": "gmail", "detected_at": "…", "expenses": [ … ] }'
            className="block w-full rounded-control border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-brand focus:outline-none"
          />
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2 focus-within:outline-3 focus-within:outline-brand">
              <FileUp className="size-4" aria-hidden /> Cargar archivo .json
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {text && <Button variant="ghost" onClick={() => review('')}>Limpiar</Button>}
          </div>
          <p className="text-xs text-muted">
            El formato está en <code>docs/ingesta-correo.md</code> del repositorio. La app no lee tu correo ni pide contraseñas: solo recibe este archivo.
          </p>
        </div>

        {parsed && (
          <div className="mt-4 space-y-3" aria-live="polite">
            {!parsed.ok ? (
              <p role="alert" className="flex gap-2 rounded-control bg-danger-soft p-3 text-sm font-semibold text-ink">
                <CircleAlert className="size-5 shrink-0 text-danger" aria-hidden />
                {parsed.errors[0]?.message}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="En el archivo" value={parsed.expenses.length + new Set(parsed.errors.map((e) => e.index)).size} />
                  <Stat label="Nuevos" value={preview?.nuevos.length ?? 0} tone="ok" />
                  <Stat label="Ya importados (duplicados)" value={preview?.duplicados.length ?? 0} tone={preview?.duplicados.length ? 'warn' : undefined} />
                  <Stat label="Con errores" value={new Set(parsed.errors.map((e) => e.index)).size} tone={parsed.errors.length ? 'danger' : undefined} />
                </div>
                {parsed.errors.length > 0 && (
                  <IssueList title="No se importarán" tone="danger" issues={parsed.errors.map((e) => `Gasto ${e.index + 1}: ${e.message}`)} />
                )}
                {parsed.warnings.length > 0 && (
                  <IssueList title="Avisos (sí se importan)" tone="warn" issues={parsed.warnings.map((e) => `Gasto ${e.index + 1}: ${e.message}`)} />
                )}
                {preview && preview.duplicados.length > 0 && (
                  <IssueList title="Duplicados (no se vuelven a registrar)" tone="warn" issues={preview.duplicados.map((d) => `${d.merchant} · ${formatMXN(d.amount_cents)} · ${formatDate(d.date)}`)} />
                )}
                <Button onClick={doImport} loading={busy} disabled={!preview?.nuevos.length}>
                  <MailCheck className="size-4" aria-hidden />
                  {preview?.nuevos.length ? `Importar ${preview.nuevos.length} como pendientes` : 'No hay gastos nuevos'}
                </Button>
              </>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title={`2. Por confirmar${pending.length ? ` (${pending.length})` : ''}`}
        action={
          pending.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setSelected(selected.size === pending.length ? new Set() : new Set(pending.map((p) => p.id)))}>
                {selected.size === pending.length ? 'Quitar selección' : 'Seleccionar todos'}
              </Button>
              <Button onClick={() => confirm(selectedItems)} disabled={!selectedItems.length} loading={busy}>
                Confirmar {selectedItems.length || ''}
              </Button>
              <Button variant="secondary" onClick={() => discard(selectedItems)} disabled={!selectedItems.length || busy}>
                Descartar {selectedItems.length || ''}
              </Button>
            </div>
          )
        }
      >
        {inbox.loading ? (
          <ListSkeleton />
        ) : !pending.length ? (
          <EmptyState icon={<Inbox />} title="Nada pendiente" text="Cuando importes el archivo de Byte, aquí verás cada gasto para confirmarlo, editarlo o descartarlo." />
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((p) => {
              const e = edits[p.id] ?? {};
              const f = flags.get(p.id);
              const setE = (patch: RowEdit) => setEdits((all) => ({ ...all, [p.id]: { ...all[p.id], ...patch } }));
              const amountInvalid = e.amount !== undefined && !((parseToCents(e.amount) ?? 0) > 0);
              return (
                <li key={p.id} className="py-4" data-testid="pendiente">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0 accent-[var(--color-brand)]"
                      aria-label={`Seleccionar ${p.merchant}`}
                      checked={selected.has(p.id)}
                      onChange={(ev) => setSelected((s) => { const n = new Set(s); if (ev.target.checked) n.add(p.id); else n.delete(p.id); return n; })}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="font-semibold text-ink">{p.merchant}</p>
                        <p className={cx('num font-bold', p.direction === 'entrada' ? 'text-ingreso' : 'text-ink')}>
                          {p.direction === 'entrada' ? '+' : '−'}{formatMXN(p.amount)}
                        </p>
                      </div>
                      <p className="text-xs text-muted">
                        {INGEST_TYPE_LABELS[p.type]}{p.direction === 'entrada' && p.type === 'transferencia' ? ' recibida' : ''} · {formatDate(p.date)} · {p.source === 'gmail' ? 'Gmail' : 'Outlook'}
                        {p.description ? ` · ${p.description}` : ''}{p.accountHint ? ` · ${p.accountHint}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {f?.duplicate && <Flag tone="warn">Posible duplicado (mismo comercio, monto y fecha cercana)</Flag>}
                        {f?.unusual != null && <Flag tone="danger">Cargo inusual: tu promedio aquí es {formatMXN(f.unusual)}</Flag>}
                        {!p.accountId && e.accountId === undefined && <Flag tone="warn">Cuenta por asignar</Flag>}
                        {p.categoryRaw && <Flag tone="info">Byte sugirió «{p.categoryRaw}»</Flag>}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {p.direction === 'salida' && !(p.type === 'retiro_efectivo' && accounts.some((a) => a.kind === 'efectivo')) && (
                          <label className="text-xs font-semibold text-ink-2">
                            Categoría
                            <select
                              className="mt-1 block min-h-11 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink"
                              value={e.category ?? p.category}
                              onChange={(ev) => setE({ category: ev.target.value as ExpenseCategory })}
                            >
                              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
                            </select>
                          </label>
                        )}
                        <label className="text-xs font-semibold text-ink-2">
                          Monto
                          <input
                            inputMode="decimal"
                            className={cx('num mt-1 block min-h-11 w-full rounded-control border bg-surface px-2 text-sm text-ink', amountInvalid ? 'border-danger' : 'border-line')}
                            value={e.amount ?? centsToInput(p.amount)}
                            onChange={(ev) => setE({ amount: ev.target.value.replace(/[^\d.,]/g, '') })}
                            aria-invalid={amountInvalid || undefined}
                          />
                        </label>
                        <label className="text-xs font-semibold text-ink-2">
                          Cuenta
                          <select
                            className="mt-1 block min-h-11 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink"
                            value={e.accountId ?? p.accountId ?? ''}
                            onChange={(ev) => setE({ accountId: ev.target.value })}
                          >
                            <option value="">Por asignar</option>
                            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>)}
                          </select>
                        </label>
                      </div>
                      {p.type === 'retiro_efectivo' && accounts.some((a) => a.kind === 'efectivo') && (
                        <p className="mt-2 text-xs text-muted">Al confirmar, el retiro pasa de {accountName(e.accountId ?? p.accountId) ?? 'la cuenta elegida'} a tu cuenta de Efectivo (no cuenta como gasto).</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button onClick={() => confirm([p])} disabled={busy || amountInvalid}>Confirmar</Button>
                        <Button variant="ghost" onClick={() => discard([p])} disabled={busy}><Trash2 className="size-4" aria-hidden /> Descartar</Button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {habits.merchantRulesEnabled && <RulesPanel />}

      <Panel title={<span className="flex items-center gap-2"><History className="size-5" aria-hidden /> Historial de importaciones</span>}>
        {!history.length ? (
          <p className="text-sm text-muted">Aún no hay importaciones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 font-semibold">Origen</th>
                  <th className="py-2 pr-3 text-right font-semibold">Gastos</th>
                  <th className="py-2 pr-3 text-right font-semibold">Duplicados</th>
                  <th className="py-2 pr-3 text-right font-semibold">Confirmados</th>
                  <th className="py-2 pr-3 text-right font-semibold">Descartados</th>
                  <th className="py-2 text-right font-semibold">Pendientes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map(({ imp, confirmados, descartados, pendientes }) => (
                  <tr key={imp.id} data-testid="historial">
                    <td className="py-2 pr-3">{new Date(imp.date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="py-2 pr-3">{imp.source === 'gmail' ? 'Gmail' : 'Outlook'}</td>
                    <td className="num py-2 pr-3 text-right">{imp.nuevos}{imp.invalidos ? ` (+${imp.invalidos} con error)` : ''}</td>
                    <td className="num py-2 pr-3 text-right">{imp.duplicados}</td>
                    <td className="num py-2 pr-3 text-right">{confirmados}{imp.autoConfirmados ? ` (${imp.autoConfirmados} auto)` : ''}</td>
                    <td className="num py-2 pr-3 text-right">{descartados}</td>
                    <td className="num py-2 text-right">{pendientes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RulesPanel() {
  const { store } = useData();
  const rules = useCol('merchantRules').items;
  const toast = useToast();
  return (
    <Panel title="Reglas por comercio">
      <p className="mb-3 text-sm text-muted">Se crean al confirmar. Los siguientes gastos del mismo comercio toman la misma categoría. La auto-confirmación está apagada hasta que tú la enciendas, comercio por comercio.</p>
      {!rules.length ? (
        <p className="text-sm text-muted">Aún no hay reglas: confirma un gasto para crear la primera.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{r.merchant}</p>
                <p className="text-xs text-muted">{CATEGORIES[r.category].label}</p>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-2">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--color-brand)]"
                  checked={r.autoConfirm}
                  onChange={async (ev) => {
                    try {
                      await store.update('merchantRules', r.id, { autoConfirm: ev.target.checked });
                    } catch (e) {
                      toast(humanError(e), 'error');
                    }
                  }}
                />
                Auto-confirmar
              </label>
              <Button variant="ghost" onClick={() => void store.remove('merchantRules', r.id)} aria-label={`Eliminar regla de ${r.merchant}`}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className={cx('rounded-control p-3', tone === 'ok' ? 'bg-ok-soft' : tone === 'warn' ? 'bg-warn-soft' : tone === 'danger' ? 'bg-danger-soft' : 'bg-surface-2')}>
      <p className="text-xs font-semibold text-ink-2">{label}</p>
      <p className="num text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: string[]; tone: 'warn' | 'danger' }) {
  return (
    <details className={cx('rounded-control p-3 text-sm', tone === 'danger' ? 'bg-danger-soft' : 'bg-warn-soft')} open={tone === 'danger'}>
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-ink">
        <TriangleAlert className={cx('size-4', tone === 'danger' ? 'text-danger' : 'text-warn')} aria-hidden /> {title} ({issues.length})
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
        {issues.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </details>
  );
}

function Flag({ tone, children }: { tone: 'warn' | 'danger' | 'info'; children: React.ReactNode }) {
  return (
    <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold text-ink', tone === 'danger' ? 'bg-danger-soft' : tone === 'warn' ? 'bg-warn-soft' : 'bg-brand-soft')}>
      {children}
    </span>
  );
}
