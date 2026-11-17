import { useMemo } from 'react';
import { allBalances } from '../lib/accounts';
import { computeAlerts } from '../lib/alerts';
import { todayISO } from '../lib/dates';
import { emergencyFund, weeklySummary } from '../lib/health';
import { useCol, useHabits } from './DataContext';

/** Saldos, fondo de emergencia, alertas y resumen semanal calculados con los datos reales. */
export function useHealth() {
  const expenses = useCol('expenses').items;
  const incomes = useCol('incomes').items;
  const accounts = useCol('accounts').items;
  const transfers = useCol('transfers').items;
  const inbox = useCol('inbox').items;
  const habits = useHabits();
  const today = todayISO();

  return useMemo(() => {
    const balances = allBalances(accounts, expenses, incomes, transfers);
    const fundBalance = habits.emergencyAccountId ? balances.get(habits.emergencyAccountId)?.balance : undefined;
    const fund = emergencyFund(habits, fundBalance, expenses, transfers, today);
    const alerts = computeAlerts({ today, expenses, inbox, accounts, balances, habits, fund });
    const weekly = weeklySummary({ today, incomes, expenses, inbox, habits, fund });
    return { balances, fund, alerts, weekly, habits, today };
  }, [accounts, expenses, incomes, transfers, inbox, habits, today]);
}
