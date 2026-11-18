import { useCallback, useEffect, useMemo, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LogIn, ShieldAlert } from 'lucide-react';
import { DataProvider, humanError } from './data/DataContext';
import { firebaseConfigured } from './data/firebaseConfig';
import { LocalStore } from './data/localStore';
import { seedDemo } from './data/demoData';
import type { DataStore } from './data/store';
import { Layout } from './components/Layout';
import { SheetHost } from './components/SheetHost';
import { Button, Skeleton, ToastProvider } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { Movements } from './pages/Movements';
import { Cards } from './pages/Cards';
import { DueDates } from './pages/DueDates';
import { Pantry } from './pages/Pantry';
import { Investments } from './pages/Investments';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { More } from './pages/More';
import { ImportPage } from './pages/Import';
import { AccountsPage } from './pages/Accounts';
import { HealthPage } from './pages/Health';

function Shell({ store, exit, userLabel, onResetDemo }: { store: DataStore; exit?: () => void; userLabel?: string; onResetDemo?: (withExamples: boolean) => void }) {
  return (
    <DataProvider store={store} exit={exit} userLabel={userLabel}>
      <HashRouter>
        <SheetHost>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/movimientos" element={<Movements />} />
              <Route path="/tarjetas" element={<Cards />} />
              <Route path="/vencimientos" element={<DueDates />} />
              <Route path="/despensa" element={<Pantry />} />
              <Route path="/inversiones" element={<Investments />} />
              <Route path="/reportes" element={<Reports />} />
              <Route path="/ajustes" element={<SettingsPage onResetDemo={onResetDemo} />} />
              <Route path="/mas" element={<More />} />
              <Route path="/importar" element={<ImportPage />} />
              <Route path="/cuentas" element={<AccountsPage />} />
              <Route path="/salud" element={<HealthPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </SheetHost>
      </HashRouter>
    </DataProvider>
  );
}

// ---------- Modo demo ----------

const demoStore = new LocalStore();

function DemoApp({ exit }: { exit?: () => void }) {
  const [ready, setReady] = useState(demoStore.hasData());
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!ready) void seedDemo(demoStore).then(() => setReady(true));
  }, [ready]);

  const onResetDemo = useCallback(async (withExamples: boolean) => {
    demoStore.clearAll();
    if (withExamples) await seedDemo(demoStore);
    else demoStore.markSeeded();
    setKey((k) => k + 1);
  }, []);

  if (!ready) return <BootSkeleton />;
  return <Shell key={key} store={demoStore} exit={exit} onResetDemo={onResetDemo} />;
}

// ---------- Modo Firebase (un solo usuario) ----------

type AuthState =
  | { s: 'loading' }
  | { s: 'out'; error?: string }
  | { s: 'denied'; email: string }
  | { s: 'in'; store: DataStore; label: string }
  | { s: 'demo' };

type FirebaseModule = typeof import('./data/firebase');

function AuthApp() {
  const [st, setSt] = useState<AuthState>({ s: 'loading' });
  const [fb, setFb] = useState<FirebaseModule | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let alive = true;
    import('./data/firebase')
      .then((m) => {
        if (!alive) return;
        setFb(m);
        unsub = m.watchAuth(async (user) => {
          if (!user) {
            setSt((prev) => (prev.s === 'demo' ? prev : prev.s === 'denied' ? prev : { s: 'out' }));
            return;
          }
          try {
            const ok = await m.verifyAccess(user.uid);
            if (!ok) {
              setSt({ s: 'denied', email: user.email ?? '' });
              await m.signOutUser();
              return;
            }
            setSt({ s: 'in', store: new m.FirebaseStore(user.uid), label: user.email ?? user.displayName ?? '' });
          } catch (e) {
            setSt({ s: 'out', error: humanError(e) });
          }
        });
      })
      .catch((e: unknown) => setSt({ s: 'out', error: humanError(e) }));
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  const signOut = useMemo(() => (fb ? () => void fb.signOutUser().then(() => setSt({ s: 'out' })) : undefined), [fb]);

  if (st.s === 'loading') return <BootSkeleton />;
  if (st.s === 'demo') return <DemoApp exit={() => setSt({ s: 'out' })} />;
  if (st.s === 'in') return <Shell store={st.store} exit={signOut} userLabel={st.label} />;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-sheet bg-surface p-8 text-center shadow-card">
        <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-card bg-brand text-3xl font-extrabold text-brand-ink" aria-hidden>$</span>
        <h1 className="text-2xl font-extrabold text-ink">Finanzas</h1>
        <p className="mt-1 text-sm text-muted">Tu dinero, claro y en un solo lugar.</p>
        {st.s === 'denied' && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-control bg-danger-soft p-3 text-left text-sm font-semibold text-ink">
            <ShieldAlert className="size-5 shrink-0 text-danger" aria-hidden />
            La cuenta {st.email} no tiene acceso. Esta app es privada.
          </p>
        )}
        {st.s === 'out' && st.error && (
          <p role="alert" className="mt-4 rounded-control bg-danger-soft p-3 text-left text-sm font-semibold text-ink">{st.error}</p>
        )}
        <Button
          className="mt-6 w-full"
          loading={busy}
          onClick={async () => {
            if (!fb) return;
            setBusy(true);
            try {
              await fb.signInWithGoogle();
            } catch (e) {
              setSt({ s: 'out', error: humanError(e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogIn className="size-4" aria-hidden /> Entrar con Google
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setSt({ s: 'demo' })}>
          Ver demo con datos de ejemplo
        </Button>
      </div>
    </main>
  );
}

function BootSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6" role="status" aria-label="Cargando">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-card" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
      </div>
    </div>
  );
}

export function App() {
  return <ToastProvider>{firebaseConfigured ? <AuthApp /> : <DemoApp />}</ToastProvider>;
}
