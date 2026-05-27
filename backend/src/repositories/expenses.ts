import pool, { query } from '../db.js';

export interface FixedMonthlyExpense {
  id: number;
  description: string;
  amount: number;
  active: boolean;
  sortOrder: number;
}

export interface CashExpense {
  id: number;
  expenseDate: string;
  description: string;
  amount: number;
  createdAt: string;
}

interface DbFixedRow {
  id: number;
  description: string;
  amount: string | number;
  active: number | boolean;
  sort_order: number;
}

interface DbCashRow {
  id: number;
  expense_date: string | Date;
  description: string;
  amount: string | number;
  created_at: string | Date;
}

function parseAmount(raw: string | number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function rowToFixed(r: DbFixedRow): FixedMonthlyExpense {
  return {
    id: r.id,
    description: r.description,
    amount: parseAmount(r.amount),
    active: Boolean(r.active),
    sortOrder: Number(r.sort_order) || 0,
  };
}

function rowToCash(r: DbCashRow): CashExpense {
  const d = r.expense_date;
  const expenseDate =
    typeof d === 'string'
      ? d.slice(0, 10)
      : d instanceof Date
        ? d.toISOString().slice(0, 10)
        : String(d).slice(0, 10);
  const createdAt =
    typeof r.created_at === 'string'
      ? r.created_at
      : r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at);
  return {
    id: r.id,
    expenseDate,
    description: r.description,
    amount: parseAmount(r.amount),
    createdAt,
  };
}

export async function listFixedMonthlyExpenses(): Promise<FixedMonthlyExpense[]> {
  const rows = await query<DbFixedRow[]>(
    'SELECT id, description, amount, active, sort_order FROM fixed_monthly_expenses ORDER BY sort_order ASC, id ASC'
  );
  return rows.map(rowToFixed);
}

export async function createFixedMonthlyExpense(data: {
  description: string;
  amount: number;
  active?: boolean;
}): Promise<FixedMonthlyExpense> {
  const desc = data.description.trim();
  if (!desc) throw new Error('La descripción es obligatoria.');
  const amount = parseAmount(data.amount);
  if (amount <= 0) throw new Error('El monto mensual debe ser mayor a 0.');
  const [res] = await pool.execute(
    'INSERT INTO fixed_monthly_expenses (description, amount, active, sort_order) VALUES (?, ?, ?, ?)',
    [desc, amount, data.active === false ? 0 : 1, 0]
  );
  const id = (res as { insertId: number }).insertId;
  const rows = await query<DbFixedRow[]>(
    'SELECT id, description, amount, active, sort_order FROM fixed_monthly_expenses WHERE id = ?',
    [id]
  );
  return rowToFixed(rows[0]);
}

export async function updateFixedMonthlyExpense(
  id: number,
  data: Partial<{ description: string; amount: number; active: boolean }>
): Promise<FixedMonthlyExpense | null> {
  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (data.description !== undefined) {
    const desc = data.description.trim();
    if (!desc) throw new Error('La descripción es obligatoria.');
    fields.push('description = ?');
    values.push(desc);
  }
  if (data.amount !== undefined) {
    const amount = parseAmount(data.amount);
    if (amount <= 0) throw new Error('El monto mensual debe ser mayor a 0.');
    fields.push('amount = ?');
    values.push(amount);
  }
  if (data.active !== undefined) {
    fields.push('active = ?');
    values.push(data.active ? 1 : 0);
  }
  if (fields.length === 0) return getFixedMonthlyExpenseById(id);
  values.push(id);
  await pool.execute(`UPDATE fixed_monthly_expenses SET ${fields.join(', ')} WHERE id = ?`, values);
  return getFixedMonthlyExpenseById(id);
}

export async function getFixedMonthlyExpenseById(id: number): Promise<FixedMonthlyExpense | null> {
  const rows = await query<DbFixedRow[]>(
    'SELECT id, description, amount, active, sort_order FROM fixed_monthly_expenses WHERE id = ?',
    [id]
  );
  return rows[0] ? rowToFixed(rows[0]) : null;
}

export async function deleteFixedMonthlyExpense(id: number): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM fixed_monthly_expenses WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

export async function listCashExpensesInRange(fromYmd: string, toYmd: string): Promise<CashExpense[]> {
  const rows = await query<DbCashRow[]>(
    `SELECT id, expense_date, description, amount, created_at
     FROM cash_expenses
     WHERE expense_date >= ? AND expense_date <= ?
     ORDER BY expense_date DESC, id DESC`,
    [fromYmd, toYmd]
  );
  return rows.map(rowToCash);
}

export async function createCashExpense(data: {
  expenseDate: string;
  description: string;
  amount: number;
}): Promise<CashExpense> {
  const date = String(data.expenseDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida.');
  const desc = data.description.trim();
  if (!desc) throw new Error('La descripción es obligatoria.');
  const amount = parseAmount(data.amount);
  if (amount <= 0) throw new Error('El monto debe ser mayor a 0.');
  const [res] = await pool.execute(
    'INSERT INTO cash_expenses (expense_date, description, amount) VALUES (?, ?, ?)',
    [date, desc, amount]
  );
  const id = (res as { insertId: number }).insertId;
  const rows = await query<DbCashRow[]>(
    'SELECT id, expense_date, description, amount, created_at FROM cash_expenses WHERE id = ?',
    [id]
  );
  return rowToCash(rows[0]);
}

export async function updateCashExpense(
  id: number,
  data: Partial<{ expenseDate: string; description: string; amount: number }>
): Promise<CashExpense | null> {
  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (data.expenseDate !== undefined) {
    const date = String(data.expenseDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida.');
    fields.push('expense_date = ?');
    values.push(date);
  }
  if (data.description !== undefined) {
    const desc = data.description.trim();
    if (!desc) throw new Error('La descripción es obligatoria.');
    fields.push('description = ?');
    values.push(desc);
  }
  if (data.amount !== undefined) {
    const amount = parseAmount(data.amount);
    if (amount <= 0) throw new Error('El monto debe ser mayor a 0.');
    fields.push('amount = ?');
    values.push(amount);
  }
  if (fields.length === 0) return getCashExpenseById(id);
  values.push(id);
  await pool.execute(`UPDATE cash_expenses SET ${fields.join(', ')} WHERE id = ?`, values);
  return getCashExpenseById(id);
}

export async function getCashExpenseById(id: number): Promise<CashExpense | null> {
  const rows = await query<DbCashRow[]>(
    'SELECT id, expense_date, description, amount, created_at FROM cash_expenses WHERE id = ?',
    [id]
  );
  return rows[0] ? rowToCash(rows[0]) : null;
}

export async function deleteCashExpense(id: number): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM cash_expenses WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
