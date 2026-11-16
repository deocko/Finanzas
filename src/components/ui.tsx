import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, RefreshCw, X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ---------- Botones ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary', className, loading, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-brand text-brand-ink hover:opacity-90',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90 dark:text-gray-950',
        className,
      )}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2', className)}
    >
      {children}
    </button>
  );
}

// ---------- Contenedores ----------

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-card bg-surface p-4 shadow-card sm:p-6', className)}>
      {(title || action) && (
        <div className="mb-4 flex min-h-11 items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------- Estados ----------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-control', className)} aria-hidden />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand [&>svg]:size-8">{icon}</div>
      <p className="text-base font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card bg-danger-soft px-4 py-6 text-center">
      <CircleAlert className="size-8 text-danger" aria-hidden />
      <p className="text-sm font-semibold text-ink">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden /> Reintentar
        </Button>
      )}
    </div>
  );
}

// ---------- Formularios ----------

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-2">{label}</label>
      {children}
      {error ? (
        <p className="text-xs font-semibold text-danger" role="alert">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

const inputCls =
  'block min-h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-ink placeholder:text-muted focus:border-brand focus:outline-none focus-visible:outline-3 focus-visible:outline-brand';

export function TextInput({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id ?? id}>
      <input id={id} {...rest} className={cx(inputCls, rest.className)} aria-invalid={!!error || undefined} />
    </Field>
  );
}

export function MoneyInput({
  label, value, onChange, error, hint, big, autoFocus, id: idProp,
}: { label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: ReactNode; big?: boolean; autoFocus?: boolean; id?: string }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <span className={cx('pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted', big ? 'text-2xl' : 'text-base')}>$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          aria-invalid={!!error || undefined}
          className={cx(inputCls, 'num pl-8', big && 'min-h-16 text-3xl font-extrabold')}
        />
      </div>
    </Field>
  );
}

export function SelectInput({ label, hint, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} {...rest} className={cx(inputCls, 'appearance-auto')}>
        {children}
      </select>
    </Field>
  );
}

export function Segmented<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-semibold text-ink-2">{label}</legend>
      <div className="grid gap-1 rounded-control bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-11 rounded-md px-2 text-sm font-semibold transition-colors',
              value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// ---------- Hoja / diálogo ----------

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const first = f[0];
        const last = f[f.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // foco inicial si nada tiene autofocus
    queueMicrotask(() => {
      if (ref.current && !ref.current.contains(document.activeElement)) {
        ref.current.querySelector<HTMLElement>('input, select, button')?.focus();
      }
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-in relative flex max-h-[92dvh] w-full flex-col rounded-t-sheet bg-surface shadow-card sm:max-w-lg sm:rounded-sheet"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2 sm:px-6">
          <h2 id={titleId} className="text-lg font-bold text-ink">{title}</h2>
          <IconButton label="Cerrar" onClick={onClose}><X className="size-5" aria-hidden /></IconButton>
        </div>
        <div className="safe-bottom overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

// ---------- Avisos (toasts) ----------

interface Toast { id: number; text: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-36 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="toast-in pointer-events-auto flex max-w-md items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-card"
          >
            {t.kind === 'ok' ? <CircleCheck className="size-5 shrink-0 text-emerald-400 dark:text-emerald-700" aria-hidden /> : <CircleAlert className="size-5 shrink-0 text-rose-400 dark:text-rose-700" aria-hidden />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
