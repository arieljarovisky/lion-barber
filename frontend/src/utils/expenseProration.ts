import { eachDayOfInterval, endOfMonth, format, parseISO } from 'date-fns';
import type { FixedMonthlyExpense } from '../api';

export type ProratedFixedExpense = {
  id: number;
  description: string;
  monthlyAmount: number;
  proratedAmount: number;
};

/** Reparte cada gasto fijo mensual activo sobre los días del período (from–to inclusive). */
export function prorateFixedMonthlyExpenses(
  items: FixedMonthlyExpense[],
  fromYmd: string,
  toYmd: string
): { lines: ProratedFixedExpense[]; total: number } {
  const start = parseISO(`${fromYmd}T12:00:00`);
  const end = parseISO(`${toYmd}T12:00:00`);
  if (end < start) return { lines: [], total: 0 };

  const active = items.filter((x) => x.active && x.amount > 0);
  const totalsById = new Map<number, ProratedFixedExpense>();

  for (const day of eachDayOfInterval({ start, end })) {
    const daysInMonth = endOfMonth(day).getDate();
    for (const item of active) {
      const daily = item.amount / daysInMonth;
      const prev = totalsById.get(item.id);
      if (prev) {
        prev.proratedAmount += daily;
      } else {
        totalsById.set(item.id, {
          id: item.id,
          description: item.description,
          monthlyAmount: item.amount,
          proratedAmount: daily,
        });
      }
    }
  }

  const lines = [...totalsById.values()]
    .map((l) => ({
      ...l,
      proratedAmount: Math.round(l.proratedAmount * 100) / 100,
    }))
    .sort((a, b) => a.description.localeCompare(b.description, 'es', { sensitivity: 'base' }));

  const total = Math.round(lines.reduce((s, l) => s + l.proratedAmount, 0) * 100) / 100;
  return { lines, total };
}

export function sumCashExpenses(items: { amount: number }[]): number {
  return Math.round(items.reduce((s, x) => s + x.amount, 0) * 100) / 100;
}

export function formatExpenseMonthHint(fromYmd: string, toYmd: string): string {
  if (fromYmd === toYmd) {
    return format(parseISO(`${fromYmd}T12:00:00`), 'MMMM yyyy');
  }
  return `${fromYmd} → ${toYmd}`;
}
