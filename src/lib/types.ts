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
  /** Cuenta a la que entró el dinero (opcional). */
  accountId?: string;
  importItemId?: string;
  /** Rubro del catálogo (Mensaje 4). */
  rubroId?: string;
  /** Ingreso recurrente al que corresponde (p. ej. Nómina). */
  recurringId?: string;
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
  /** Comercio (importado del correo o capturado). */
  merchant?: string;
  /** Cuenta de la que salió el dinero. Sin cuenta = «por asignar». */
  accountId?: string;
  /** Renglón de importación del que viene (colección `inbox`). */
  importItemId?: string;
  /** Rubro del catálogo (Mensaje 4). */
  rubroId?: string;
  /** Cargo recurrente al que corresponde (p. ej. Spotify). */
  recurringId?: string;
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

// ---------- Cuentas, importación desde correo y salud financiera ----------

export type AccountKind =
  | 'banco'
  | 'efectivo'
  | 'mercado_pago'
  | 'tarjeta_credito'
  /** Tarjeta de servicios (se paga completa cada mes; no es de crédito), p. ej. Amex Green. */
  | 'tarjeta_servicios'
  /** Tarjeta cuyo tipo exacto falta confirmar. */
  | 'tarjeta'
  /** Préstamo hipotecario: el saldo es deuda. */
  | 'hipotecario'
  | 'otra';

/** Cuenta donde vive el dinero. Solo últimos 4 dígitos, nunca el número completo. */
export interface Account extends BaseDoc {
  name: string;
  kind: AccountKind;
  last4?: string;
  /** Saldo a la fecha `initialDate`. Los movimientos anteriores no cuentan. */
  initialBalance: Cents;
  initialDate: ISODate;
  /** Umbral de alerta de saldo bajo (opcional). */
  lowBalanceThreshold?: Cents;
  /** Banco o emisor (p. ej. "BBVA", "American Express"). */
  institution?: string;
  /** Descripción visible (p. ej. "Principal: ahí llega la nómina"). */
  note?: string;
  /**
   * true = Diego aún no confirma el saldo inicial: `initialBalance` se ignora y se muestra «por confirmar».
   * Los movimientos confirmados se siguen contando desde `initialDate`.
   */
  balancePending?: boolean;
  /** Tarjetas: día de corte y día límite de pago. Sin valor = por confirmar. */
  cutDay?: number;
  dueDay?: number;
  /** Tarjetas de crédito: límite. Sin valor = por confirmar. */
  creditLimit?: Cents;
  /** Clave del alta inicial (Mensaje 4), para no duplicar. */
  setupKey?: string;
}

/** Movimiento entre cuentas propias (p. ej. aporte al fondo de emergencia). No es gasto ni ingreso. */
export interface Transfer extends BaseDoc {
  date: ISODate;
  amount: Cents;
  fromAccountId?: string;
  toAccountId: string;
  concept: string;
  importItemId?: string;
}

export type IngestType = 'compra' | 'suscripcion' | 'transferencia' | 'retiro_efectivo' | 'cargo_recurrente' | 'reembolso';
export type IngestSource = 'gmail' | 'outlook';
export type InboxStatus = 'pendiente' | 'confirmado' | 'descartado';

/** Gasto detectado por Byte en el correo, esperando confirmación de Diego. */
export interface InboxItem extends BaseDoc {
  /** `id` del JSON de Byte (estable, para deduplicar). */
  extId: string;
  importId: string;
  source: IngestSource;
  date: ISODate;
  merchant: string;
  description: string;
  amount: Cents;
  type: IngestType;
  /** salida = gasto; entrada = reembolso o transferencia recibida. */
  direction: 'salida' | 'entrada';
  category: ExpenseCategory;
  /** Categoría tal como la sugirió Byte (si no existía en la app). */
  categoryRaw?: string;
  accountId?: string;
  /** Solo "****1234" o texto sin números largos. */
  accountHint?: string;
  reference?: string;
  sourceMessage?: string;
  status: InboxStatus;
  expenseId?: string;
  incomeId?: string;
  transferId?: string;
  decidedAt?: number;
  /** Rubro sugerido (Mensaje 4): por regla del comercio o «por clasificar». */
  rubroId?: string;
  /** Recurrente que coincide (nómina, Spotify…). */
  recurringId?: string;
}

/** Historial de importaciones. */
export interface ImportRecord extends BaseDoc {
  date: number;
  source: IngestSource;
  detectedAt: string;
  total: number;
  nuevos: number;
  duplicados: number;
  invalidos: number;
  autoConfirmados: number;
}

/** Regla por comercio (solo aplica si Diego activó las reglas en Ajustes). */
export interface MerchantRule extends BaseDoc {
  merchantKey: string;
  merchant: string;
  category: ExpenseCategory;
  accountId?: string;
  /** Desactivado por defecto: solo Diego lo enciende, comercio por comercio. */
  autoConfirm: boolean;
}

export type SpendGroup = 'necesidad' | 'deseo';

/** Hábitos y salud financiera. Todo editable; nada se ejecuta solo. */
export interface Habits extends BaseDoc {
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  /** Grupo 50/30/20 de cada categoría. */
  categoryGroups: Record<ExpenseCategory, SpendGroup>;
  /** Meses de gasto esencial (3 a 6). */
  emergencyMonths: number;
  /** En cuántos meses quiere alcanzar la meta (para sugerir el aporte mensual). */
  emergencyHorizonMonths: number;
  /** Cuenta donde vive el fondo de emergencia (sin elegir = sin seguimiento). */
  emergencyAccountId?: string;
  /** Gasto esencial mensual fijado a mano (si no, se calcula con el promedio de 3 meses). */
  essentialMonthlyOverride?: Cents;
  /** Regla de 24 h: monto a partir del cual se sugiere esperar (0 = apagada). */
  impulseThreshold: Cents;
  /** Presupuesto mensual por categoría (sin valor = sin presupuesto). */
  budgets: Partial<Record<ExpenseCategory, Cents>>;
  /** Días de anticipación para avisar renovaciones. */
  renewalNoticeDays: number;
  /** Reglas por comercio (aprender categoría). Desactivado por defecto. */
  merchantRulesEnabled: boolean;
}

// ---------- Catálogo de rubros, reglas por comercio y recurrentes (Mensaje 4) ----------

export type RubroFlow = 'gasto' | 'ingreso';

/** Rubro del catálogo. Sin `parentId` = rubro principal (p. ej. «Vivienda»). */
export interface Rubro extends BaseDoc {
  name: string;
  parentId?: string;
  flow: RubroFlow;
  /** Categoría del MVP con que se registra (presupuestos, 50/30/20, reportes). */
  category?: ExpenseCategory;
  /** Salió de un comercio o concepto nuevo: pendiente de que Diego lo tipifique. */
  porClasificar?: boolean;
  order?: number;
}

/**
 * Regla comercio → rubro sugerido. Solo SUGIERE: el movimiento sigue pendiente de confirmación.
 * origin: 'catalogo' (alta inicial), 'diego' (Diego la cambió), 'nuevo' (comercio desconocido, por clasificar).
 */
export interface MerchantRubro extends BaseDoc {
  merchantKey: string;
  merchant: string;
  rubroId: string;
  origin: 'catalogo' | 'diego' | 'nuevo';
}

export type RecurringFrequency = 'quincenal' | 'mensual' | 'anual' | 'mensual_o_anual' | 'variable' | 'por_confirmar';

/** Ingreso o cargo recurrente. Lo que no tenga valor está «por confirmar»; nunca se inventa. */
export interface Recurring extends BaseDoc {
  name: string;
  flow: 'ingreso' | 'cargo';
  rubroId: string;
  frequency: RecurringFrequency;
  /** Monto esperado por evento. Sin valor = por confirmar. */
  expectedAmount?: Cents;
  /** Diego confirmó el monto. */
  amountConfirmed: boolean;
  /** Días estimados del mes (p. ej. [13, 28]). Sin valor = fecha por confirmar. */
  days?: number[];
  /** Diego confirmó las fechas (si no, son aproximadas). */
  daysConfirmed?: boolean;
  accountId?: string;
  /** Palabras con que se reconoce en el comercio o concepto que detecta Byte. */
  match: string[];
  note?: string;
  setupKey?: string;
}

/** Marcas internas (p. ej. qué versión del alta inicial ya se aplicó). */
export interface Meta extends BaseDoc {
  setupVersion: number;
  appliedAt: number;
}

export interface CollectionMap {
  incomes: Income;
  expenses: Expense;
  cards: Card;
  bills: Bill;
  crypto: CryptoHolding;
  funds: Fund;
  settings: Settings;
  accounts: Account;
  transfers: Transfer;
  inbox: InboxItem;
  imports: ImportRecord;
  merchantRules: MerchantRule;
  habits: Habits;
  rubros: Rubro;
  merchantRubros: MerchantRubro;
  recurrings: Recurring;
  meta: Meta;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTIONS: CollectionName[] = [
  'incomes', 'expenses', 'cards', 'bills', 'crypto', 'funds', 'settings',
  'accounts', 'transfers', 'inbox', 'imports', 'merchantRules', 'habits',
  'rubros', 'merchantRubros', 'recurrings', 'meta',
];

export const HABITS_ID = 'config';

export const SETTINGS_ID = 'perfil';
