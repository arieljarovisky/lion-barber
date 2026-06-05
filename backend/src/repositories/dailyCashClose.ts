import pool, { query } from '../db.js';
import { mysqlUtcNaiveToIsoInstant } from '../mysqlUtcDatetime.js';
import type { DailyCashClose } from '../types.js';
import {
  deletePaymentSnapshotsForDate,
  snapshotPaymentsForDailyClose,
} from './dailyCashCloseSnapshots.js';

interface DbDailyCashClose {
  close_date: string | Date;
  closed_by_user_id: number;
  closed_at: string | Date;
  closed_by_name?: string | null;
}

function rowDateToYmd(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function rowToClose(row: DbDailyCashClose): DailyCashClose {
  return {
    date: rowDateToYmd(row.close_date),
    closedAt: mysqlUtcNaiveToIsoInstant(row.closed_at) ?? new Date().toISOString(),
    closedByUserId: row.closed_by_user_id,
    closedByName: row.closed_by_name?.trim() || undefined,
  };
}

export async function isDailyCashCloseDate(dateYmd: string): Promise<boolean> {
  const d = dateYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const rows = await query<{ n: number }[]>(
    'SELECT 1 AS n FROM daily_cash_closes WHERE close_date = ? LIMIT 1',
    [d]
  );
  return rows.length > 0;
}

export async function listDailyCashClosesInRange(
  fromYmd: string,
  toYmd: string
): Promise<DailyCashClose[]> {
  const rows = await query<DbDailyCashClose[]>(
    `SELECT dc.close_date, dc.closed_by_user_id, dc.closed_at, u.name AS closed_by_name
     FROM daily_cash_closes dc
     LEFT JOIN users u ON u.id = dc.closed_by_user_id
     WHERE dc.close_date >= ? AND dc.close_date <= ?
     ORDER BY dc.close_date ASC`,
    [fromYmd.slice(0, 10), toYmd.slice(0, 10)]
  );
  return rows.map(rowToClose);
}

export async function getDailyCashClose(dateYmd: string): Promise<DailyCashClose | null> {
  const d = dateYmd.slice(0, 10);
  const rows = await query<DbDailyCashClose[]>(
    `SELECT dc.close_date, dc.closed_by_user_id, dc.closed_at, u.name AS closed_by_name
     FROM daily_cash_closes dc
     LEFT JOIN users u ON u.id = dc.closed_by_user_id
     WHERE dc.close_date = ?
     LIMIT 1`,
    [d]
  );
  return rows[0] ? rowToClose(rows[0]) : null;
}

export async function closeDailyCash(dateYmd: string, userId: number): Promise<DailyCashClose> {
  const d = dateYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error('Fecha inválida');
  }
  const existing = await getDailyCashClose(d);
  if (existing) {
    throw new Error('Este día ya fue cerrado.');
  }
  await query(
    'INSERT INTO daily_cash_closes (close_date, closed_by_user_id) VALUES (?, ?)',
    [d, userId]
  );
  await snapshotPaymentsForDailyClose(d);
  const created = await getDailyCashClose(d);
  if (!created) throw new Error('No se pudo registrar el cierre');
  return created;
}

export async function reopenDailyCash(dateYmd: string): Promise<boolean> {
  const d = dateYmd.slice(0, 10);
  await deletePaymentSnapshotsForDate(d);
  const [res] = await pool.execute('DELETE FROM daily_cash_closes WHERE close_date = ?', [d]);
  return ((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
}
