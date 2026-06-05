import { query } from '../db.js';
import type { Appointment, AppointmentCashClosePaymentSnapshot } from '../types.js';
import { parseServicePaymentMethod, parseServicePaymentSplits } from '../servicePaymentMethod.js';
import { parseAppointmentProductLines } from '../appointmentProducts.js';
import { getAppointmentsByDate } from './appointments.js';

interface DbSnapshotRow {
  close_date: string | Date;
  appointment_id: string;
  service_payment_splits: string | unknown | null;
  service_payment_method: string | null;
  tip_amount: number | string | null;
  deposit_paid: number;
  deposit_amount_ars: number | string | null;
  subscription_cut_applied: number;
  products: string | unknown | null;
}

function rowToSnapshot(row: DbSnapshotRow): AppointmentCashClosePaymentSnapshot {
  const closeDate =
    typeof row.close_date === 'string'
      ? row.close_date.slice(0, 10)
      : row.close_date instanceof Date
        ? row.close_date.toISOString().slice(0, 10)
        : String(row.close_date).slice(0, 10);
  return {
    appointmentId: String(row.appointment_id),
    closeDate,
    servicePaymentSplits: parseServicePaymentSplits(row.service_payment_splits),
    servicePaymentMethod: parseServicePaymentMethod(row.service_payment_method),
    tipAmount:
      row.tip_amount != null && Number.isFinite(Number(row.tip_amount))
        ? Math.round(Number(row.tip_amount) * 100) / 100
        : 0,
    depositPaid: Boolean(row.deposit_paid),
    depositAmountArs:
      row.deposit_amount_ars != null && Number.isFinite(Number(row.deposit_amount_ars))
        ? Math.round(Number(row.deposit_amount_ars) * 100) / 100
        : undefined,
    subscriptionCutApplied: Boolean(row.subscription_cut_applied),
    products: parseAppointmentProductLines(row.products),
  };
}

function snapshotEligible(app: Appointment): boolean {
  const st = app.status ?? 'scheduled';
  return st !== 'cancelled' && st !== 'pending_payment';
}

/** Congela cobros de turnos del día al cerrar caja (el cierre no cambia si después editan pagos). */
export async function snapshotPaymentsForDailyClose(dateYmd: string): Promise<number> {
  const d = dateYmd.slice(0, 10);
  const apps = (await getAppointmentsByDate(d)).filter(snapshotEligible);
  for (const app of apps) {
    const splitsJson =
      app.servicePaymentSplits && app.servicePaymentSplits.length > 0
        ? JSON.stringify(app.servicePaymentSplits)
        : null;
    const productsJson =
      app.products && app.products.length > 0 ? JSON.stringify(app.products) : null;
    await query(
      `INSERT INTO daily_cash_close_payment_snapshots (
         close_date, appointment_id, service_payment_splits, service_payment_method,
         tip_amount, deposit_paid, deposit_amount_ars, subscription_cut_applied, products
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         service_payment_splits = VALUES(service_payment_splits),
         service_payment_method = VALUES(service_payment_method),
         tip_amount = VALUES(tip_amount),
         deposit_paid = VALUES(deposit_paid),
         deposit_amount_ars = VALUES(deposit_amount_ars),
         subscription_cut_applied = VALUES(subscription_cut_applied),
         products = VALUES(products)`,
      [
        d,
        app.id,
        splitsJson,
        app.servicePaymentMethod ?? null,
        app.tipAmount ?? 0,
        app.depositPaid ? 1 : 0,
        app.depositAmountArs ?? null,
        app.subscriptionCutApplied ? 1 : 0,
        productsJson,
      ]
    );
  }
  return apps.length;
}

export async function deletePaymentSnapshotsForDate(dateYmd: string): Promise<void> {
  await query('DELETE FROM daily_cash_close_payment_snapshots WHERE close_date = ?', [
    dateYmd.slice(0, 10),
  ]);
}

export async function listPaymentSnapshotsInRange(
  fromYmd: string,
  toYmd: string
): Promise<AppointmentCashClosePaymentSnapshot[]> {
  const rows = await query<DbSnapshotRow[]>(
    `SELECT close_date, appointment_id, service_payment_splits, service_payment_method,
            tip_amount, deposit_paid, deposit_amount_ars, subscription_cut_applied, products
     FROM daily_cash_close_payment_snapshots
     WHERE close_date >= ? AND close_date <= ?
     ORDER BY close_date ASC, appointment_id ASC`,
    [fromYmd.slice(0, 10), toYmd.slice(0, 10)]
  );
  return rows.map(rowToSnapshot);
}
