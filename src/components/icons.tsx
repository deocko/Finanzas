import {
  Banknote, Car, CreditCard, Droplet, Ellipsis, Flame, Gift, GraduationCap, HeartPulse, Palmtree, Popcorn,
  ShoppingCart, Smartphone, Wallet, Wrench, Zap, type LucideIcon,
} from 'lucide-react';
import { CATEGORIES, INCOME_TYPES } from '../lib/catalog';
import type { ExpenseCategory, IncomeType } from '../lib/types';
import { cx } from './ui';

/** Un solo set (Lucide), trazo 2 px en toda la app. */
export const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  gas: Flame,
  luz: Zap,
  agua: Droplet,
  telefonia: Smartphone,
  colegiaturas: GraduationCap,
  despensa: ShoppingCart,
  mantenimiento: Wrench,
  transporte: Car,
  salud: HeartPulse,
  ocio: Popcorn,
  otros: Ellipsis,
};

export const INCOME_ICONS: Record<IncomeType, LucideIcon> = {
  sueldo: Banknote,
  aguinaldo: Gift,
  prima: Palmtree,
  otro: Wallet,
};

const sizes = { sm: 'size-9 [&>svg]:size-4', md: 'size-11 [&>svg]:size-5', lg: 'size-14 [&>svg]:size-6' };

export function CategoryBadge({ category, size = 'md' }: { category: ExpenseCategory | 'tarjeta'; size?: keyof typeof sizes }) {
  const Icon = category === 'tarjeta' ? CreditCard : CATEGORY_ICONS[category];
  const color = category === 'tarjeta' ? '#1E293B' : CATEGORIES[category].color;
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full text-white', sizes[size], category === 'tarjeta' && 'dark:ring-2 dark:ring-white/40')} style={{ background: color }} aria-hidden>
      <Icon strokeWidth={2} />
    </span>
  );
}

export function IncomeBadge({ type, size = 'md' }: { type: IncomeType; size?: keyof typeof sizes }) {
  const Icon = INCOME_ICONS[type];
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full text-white', sizes[size])} style={{ background: INCOME_TYPES[type].color }} aria-hidden>
      <Icon strokeWidth={2} />
    </span>
  );
}
