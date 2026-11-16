import type { Cents } from './money';
import type { ISODate, Period } from './dates';

export type ExpenseCategory =
  | 'gas'
  | 'luz'
  | 'agua'
  | 'telefonia'
  | 'colegiaturas'
  | 'despensa'
  | 'mantenimiento'
  | 'transporte'
  | 'salud'
  | 'ocio'
  | 'otros';

export type IncomeType = 'sueldo' | 'aguinaldo' | 'prima' | 'otro';

export type PaymentMethod = 'efectivo' | 'debito' | 'credito' | 'transferencia';

/** Campos comunes. `demo: true` marca datos de ejemplo. */
export interface BaseDoc {
  id: string;
  createdAt: number;
  demo?: boolean;
}

export interface Income extends BaseDoc {
  date: ISODate;
  concept: string;
  amount: Cents;
  type: IncomeType;
  /** Datos con los que se calculó (aguinaldo/prima), para auditoría. */
  calc?: {
    salarioDiario: Cents;
    dias: number;
    diasTrabajados?: number;
    porcentaje?: number;
  };
}

export interface Expense extends BaseDoc {
  date: ISODate;
  concept: string;
  amount: Cents;
  category: ExpenseCategory;
  method: PaymentMethod;
  /** Tarjeta usada (si method es débito/crédito). */
  cardId?: string;
  /** Tienda (despensa). */
  store?: string;
  /** Referencia a la foto del ticket: "storage:<ruta>", "doc:<id>" o "local:<id>". */
  ticketRef?: string;
}

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'carnet' | 'otra';

/**
 * Tarjeta. NUNCA se guarda el número completo, CVV ni NIP:
 * solo los últimos 4 dígitos.
 */
export interface Card extends BaseDoc {
  kind: 'credito' | 'debito';
  bank: string;
  alias: string;
  brand: CardBrand;
  last4: string;
  holder: string;
  color: string;
  /** Débito: saldo disponible. Crédito: saldo deudor actual. */
  balance: Cents;
  creditLimit?: Cents;
  /** Día del mes de corte (crédito). */
  cutDay?: number;
  /** Día del mes límite de pago (crédito). */
  dueDay?: number;
  minPayment?: Cents;
  /** Pago para no generar intereses. */
  noInterestPayment?: Cents;
  /** Periodos "YYYY-MM" ya pagados. */
  paidPeriods?: Period[];
}

export interface Bill extends BaseDoc {
  name: string;
  category: ExpenseCategory;
  amount: Cents;
  recurrence: 'mensual' | 'unico';
  /** Mensual: día del mes. */
  dueDay?: number;
  /** Único: fecha. */
  date?: ISODate;
  paidPeriods?: Period[];
}

export interface CryptoHolding extends BaseDoc {
  /** id de CoinGecko, p. ej. "bitcoin" */
  coinId: string;
  symbol: string;
  name: string;
  quantity: number;
  /** Precio de compra por unidad, en centavos MXN. */
  buyPrice: Cents;
  buyDate: ISODate;
}

export interface Fund extends BaseDoc {
  name: string;
  institution: string;
  invested: Cents;
  currentValue: Cents;
  /** Rendimiento anual reportado, en % */
  reportedYield: number;
  date: ISODate;
}

export interface Settings extends BaseDoc {
  salarioMensual: Cents;
  diasAguinaldo: number;
  aniosAntiguedad: number;
  primaPorcentaje: number;
}

export interface CollectionMap {
  incomes: Income;
  expenses: Expense;
  cards: Card;
  bills: Bill;
  crypto: CryptoHolding;
  funds: Fund;
  settings: Settings;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTIONS: CollectionName[] = ['incomes', 'expenses', 'cards', 'bills', 'crypto', 'funds', 'settings'];

export const SETTINGS_ID = 'perfil';
