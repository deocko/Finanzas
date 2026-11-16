import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Bill, Card, CryptoHolding, Expense, ExpenseCategory, Fund, Income, IncomeType } from '../lib/types';
import { ExpenseForm } from './ExpenseForm';
import { IncomeForm } from './IncomeForm';
import { BillForm, CardForm, CryptoForm, FundForm } from './forms';
import { Sheet } from './ui';

export type SheetRequest =
  | { kind: 'expense'; initial?: Expense; presetCategory?: ExpenseCategory }
  | { kind: 'income'; initial?: Income; presetType?: IncomeType }
  | { kind: 'card'; initial?: Card }
  | { kind: 'bill'; initial?: Bill }
  | { kind: 'crypto'; initial?: CryptoHolding }
  | { kind: 'fund'; initial?: Fund }
  | { kind: 'custom'; title: string; content: (close: () => void) => ReactNode };

const Ctx = createContext<(r: SheetRequest) => void>(() => {});

export function useSheet() {
  return useContext(Ctx);
}

function titleOf(r: SheetRequest): string {
  const edit = 'initial' in r && r.initial;
  switch (r.kind) {
    case 'expense': return edit ? 'Editar gasto' : r.presetCategory === 'despensa' ? 'Compra de despensa' : 'Nuevo gasto';
    case 'income': return edit ? 'Editar ingreso' : 'Nuevo ingreso';
    case 'card': return edit ? 'Editar tarjeta' : 'Nueva tarjeta';
    case 'bill': return edit ? 'Editar vencimiento' : 'Nuevo vencimiento';
    case 'crypto': return edit ? 'Editar criptomoneda' : 'Nueva criptomoneda';
    case 'fund': return edit ? 'Editar fondo' : 'Nuevo fondo de inversión';
    case 'custom': return r.title;
  }
}

export function SheetHost({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<SheetRequest | null>(null);
  const close = useCallback(() => setReq(null), []);
  return (
    <Ctx.Provider value={setReq}>
      {children}
      <Sheet open={!!req} title={req ? titleOf(req) : ''} onClose={close}>
        {req?.kind === 'expense' && <ExpenseForm initial={req.initial} presetCategory={req.presetCategory} onDone={close} />}
        {req?.kind === 'income' && <IncomeForm initial={req.initial} presetType={req.presetType} onDone={close} />}
        {req?.kind === 'card' && <CardForm initial={req.initial} onDone={close} />}
        {req?.kind === 'bill' && <BillForm initial={req.initial} onDone={close} />}
        {req?.kind === 'crypto' && <CryptoForm initial={req.initial} onDone={close} />}
        {req?.kind === 'fund' && <FundForm initial={req.initial} onDone={close} />}
        {req?.kind === 'custom' && req.content(close)}
      </Sheet>
    </Ctx.Provider>
  );
}
