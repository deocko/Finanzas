import { useMemo, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight, Bell, CalendarClock, ChartColumn, CreditCard, House, Menu, Minus, Moon, Plus, Settings, ShoppingCart, Sun, TrendingUp,
} from 'lucide-react';
import { useCol, useData } from '../data/DataContext';
import { dueItems } from '../lib/finance';
import { todayISO } from '../lib/dates';
import { useTheme } from '../theme';
import { useSheet } from './SheetHost';
import { IconButton, cx } from './ui';

const NAV = [
  { to: '/', label: 'Inicio', icon: House, mobile: true },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight, mobile: true },
  { to: '/tarjetas', label: 'Tarjetas', icon: CreditCard, mobile: true },
  { to: '/vencimientos', label: 'Vencimientos', icon: CalendarClock, mobile: true },
  { to: '/despensa', label: 'Despensa', icon: ShoppingCart, mobile: false },
  { to: '/inversiones', label: 'Inversiones', icon: TrendingUp, mobile: false },
  { to: '/reportes', label: 'Reportes', icon: ChartColumn, mobile: false },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, mobile: false },
];

export function useUrgentCount(): number {
  const cards = useCol('cards').items;
  const bills = useCol('bills').items;
  return useMemo(() => dueItems(cards, bills, todayISO()).filter((d) => d.semaforo === 'rojo').length, [cards, bills]);
}

export function Layout({ children }: { children: ReactNode }) {
  const { store } = useData();
  const open = useSheet();
  const { theme, toggle } = useTheme();
  const urgent = useUrgentCount();
  const loc = useLocation();
  const moreActive = !NAV.filter((n) => n.mobile).some((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)));

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-control focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-ink">
        Saltar al contenido
      </a>

      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface p-4 lg:flex">
        <Brand />
        <nav className="mt-6 flex-1 space-y-1" aria-label="Principal">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx('flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-semibold', isActive ? 'bg-brand-soft text-ink' : 'text-ink-2 hover:bg-surface-2')
              }
            >
              <n.icon className="size-5" aria-hidden />
              {n.label}
              {n.to === '/vencimientos' && urgent > 0 && <UrgentBadge n={urgent} />}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2">
          <button onClick={() => open({ kind: 'expense' })} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-gasto-btn text-base font-bold text-white hover:opacity-90">
            <Minus className="size-5" aria-hidden /> Gasto
          </button>
          <button onClick={() => open({ kind: 'income' })} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ingreso-btn text-base font-bold text-white hover:opacity-90">
            <Plus className="size-5" aria-hidden /> Ingreso
          </button>
          <button onClick={toggle} className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2">
            {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Encabezado (móvil) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-1 backdrop-blur lg:hidden">
          <Brand />
          <div className="flex items-center">
            <NavLink to="/vencimientos" aria-label={`Vencimientos${urgent ? `, ${urgent} urgentes` : ''}`} className="relative inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
              <Bell className="size-5" aria-hidden />
              {urgent > 0 && <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white dark:text-gray-950">{urgent}</span>}
            </NavLink>
            <IconButton label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} onClick={toggle}>
              {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
            </IconButton>
          </div>
        </header>

        {store.mode === 'demo' && (
          <div className="bg-warn-soft px-4 py-2 text-center text-xs font-semibold text-ink" role="note">
            Modo demo: los datos son de ejemplo y se guardan solo en este navegador.
          </div>
        )}

        <main id="contenido" className="mx-auto w-full max-w-6xl px-4 pb-44 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Botones principales siempre visibles (móvil) */}
      <div className="fixed inset-x-0 bottom-[72px] z-40 flex justify-center gap-3 px-4 pb-3 lg:hidden">
        <button onClick={() => open({ kind: 'income' })} className="flex min-h-12 items-center gap-2 rounded-full bg-ingreso-btn px-5 text-base font-bold text-white shadow-[0_6px_20px_rgb(0_0_0/0.25)]">
          <Plus className="size-5" aria-hidden /> Ingreso
        </button>
        <button onClick={() => open({ kind: 'expense' })} className="flex min-h-12 items-center gap-2 rounded-full bg-gasto-btn px-6 text-base font-bold text-white shadow-[0_6px_20px_rgb(0_0_0/0.25)]">
          <Minus className="size-5" aria-hidden /> Gasto
        </button>
      </div>

      {/* Navegación inferior (móvil) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface lg:hidden" aria-label="Principal">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => cx('relative flex min-h-[72px] flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-brand' : 'text-muted')}
          >
            <n.icon className="size-6" aria-hidden />
            {n.label}
            {n.to === '/vencimientos' && urgent > 0 && <span className="absolute right-[calc(50%-20px)] top-2 size-2.5 rounded-full bg-danger" aria-hidden />}
          </NavLink>
        ))}
        <NavLink to="/mas" className={cx('flex min-h-[72px] flex-col items-center justify-center gap-1 text-[11px] font-semibold', moreActive ? 'text-brand' : 'text-muted')}>
          <Menu className="size-6" aria-hidden />
          Más
        </NavLink>
      </nav>
    </div>
  );
}

function UrgentBadge({ n }: { n: number }) {
  return (
    <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white dark:text-gray-950" aria-label={`${n} urgentes`}>
      {n}
    </span>
  );
}

function Brand() {
  return (
    <NavLink to="/" className="flex min-h-11 items-center gap-2 font-extrabold text-ink">
      <span className="flex size-9 items-center justify-center rounded-control bg-brand text-lg text-brand-ink" aria-hidden>$</span>
      <span className="text-lg tracking-tight">Finanzas</span>
    </NavLink>
  );
}

export { NAV };
