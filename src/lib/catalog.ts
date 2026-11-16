import type { CardBrand, ExpenseCategory, IncomeType, PaymentMethod } from './types';

/** Paleta cerrada: un color sólido por categoría (contraste ≥ 3:1 contra blanco para iconos). */
export const CATEGORIES: Record<ExpenseCategory, { label: string; color: string; group: string }> = {
  gas: { label: 'Gas', color: '#EA580C', group: 'Servicios' },
  luz: { label: 'Luz', color: '#A16207', group: 'Servicios' },
  agua: { label: 'Agua', color: '#0284C7', group: 'Servicios' },
  telefonia: { label: 'Telefonía e internet', color: '#7C3AED', group: 'Servicios' },
  colegiaturas: { label: 'Colegiaturas', color: '#4F46E5', group: 'Hogar' },
  despensa: { label: 'Despensa', color: '#16A34A', group: 'Hogar' },
  mantenimiento: { label: 'Mantenimiento', color: '#475569', group: 'Hogar' },
  transporte: { label: 'Transporte', color: '#2563EB', group: 'Personal' },
  salud: { label: 'Salud', color: '#E11D48', group: 'Personal' },
  ocio: { label: 'Ocio', color: '#C026D3', group: 'Personal' },
  otros: { label: 'Otros', color: '#6B7280', group: 'Personal' },
};

export const CATEGORY_ORDER = Object.keys(CATEGORIES) as ExpenseCategory[];

export const INCOME_TYPES: Record<IncomeType, { label: string; color: string }> = {
  sueldo: { label: 'Sueldo', color: '#059669' },
  aguinaldo: { label: 'Aguinaldo', color: '#D97706' },
  prima: { label: 'Prima vacacional', color: '#0891B2' },
  otro: { label: 'Otro ingreso', color: '#65A30D' },
};

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
};

export const BRANDS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  carnet: 'Carnet',
  otra: 'Otra',
};

/** Colores de banco (sólidos). Son genéricos: el usuario elige el que se parezca a su tarjeta. */
export const CARD_COLORS: { name: string; value: string }[] = [
  { name: 'Azul marino', value: '#0B2A5B' },
  { name: 'Azul', value: '#1D4ED8' },
  { name: 'Rojo', value: '#B91C1C' },
  { name: 'Naranja', value: '#C2410C' },
  { name: 'Verde', value: '#047857' },
  { name: 'Turquesa', value: '#0F766E' },
  { name: 'Morado', value: '#6D28D9' },
  { name: 'Negro', value: '#111827' },
  { name: 'Grafito', value: '#374151' },
  { name: 'Dorado', value: '#92400E' },
];

/** Monedas sugeridas (ids de CoinGecko). */
export const COINS: { id: string; symbol: string; name: string }[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'tether', symbol: 'USDT', name: 'Tether' },
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
];
