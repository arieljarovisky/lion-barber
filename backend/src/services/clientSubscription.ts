import pool, { query } from '../db.js';
import type { DbUser } from '../repositories/users.js';
import {
  getSubscriptionPlanById,
  type SubscriptionPlan,
} from '../repositories/subscriptionPlans.js';

export interface ClientSubscriptionStatus {
  planId: string;
  planName: string;
  cutsPerMonth: number;
  cutsUsed: number;
  cutsRemaining: number;
  periodStart: string;
  periodEnd: string;
  monthlyPrice: string;
}

/** Primer día del mes calendario actual (Argentina, YYYY-MM-DD). */
export function currentSubscriptionPeriodStartYmd(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${y}-${m}-01`;
}

/** Último día del mes de `periodStart` (YYYY-MM-DD). */
export function subscriptionPeriodEndYmd(periodStart: string): string {
  const [y, m] = periodStart.slice(0, 10).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  const yy = last.getUTCFullYear();
  const mm = String(last.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(last.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

type DbUserSubscription = Pick<
  DbUser,
  | 'id'
  | 'deposit_exempt'
  | 'subscription_plan_id'
  | 'subscription_period_start'
  | 'subscription_cuts_used'
>;

function rowPeriodStartYmd(u: DbUserSubscription): string | null {
  const raw = u.subscription_period_start;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') return raw.slice(0, 10);
  if (raw instanceof Date) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(raw).slice(0, 10);
}

/** Si el mes calendario cambió, reinicia el contador de cortes. */
export async function ensureSubscriptionPeriodCurrent(userId: number): Promise<void> {
  const rows = await query<DbUserSubscription[]>(
    `SELECT id, subscription_plan_id, subscription_period_start, subscription_cuts_used
     FROM users WHERE id = ? AND role = 'client' LIMIT 1`,
    [userId]
  );
  const u = rows[0];
  if (!u?.subscription_plan_id) return;

  const currentPeriod = currentSubscriptionPeriodStartYmd();
  const stored = rowPeriodStartYmd(u);
  if (stored === currentPeriod) return;

  await query(
    `UPDATE users SET subscription_period_start = ?, subscription_cuts_used = 0 WHERE id = ? AND role = 'client'`,
    [currentPeriod, userId]
  );
}

export async function getClientSubscriptionStatus(
  userId: number
): Promise<ClientSubscriptionStatus | null> {
  await ensureSubscriptionPeriodCurrent(userId);
  const rows = await query<DbUserSubscription[]>(
    `SELECT id, subscription_plan_id, subscription_period_start, subscription_cuts_used
     FROM users WHERE id = ? AND role = 'client' LIMIT 1`,
    [userId]
  );
  const u = rows[0];
  if (!u?.subscription_plan_id) return null;

  const plan = await getSubscriptionPlanById(u.subscription_plan_id);
  if (!plan || !plan.active) return null;

  const periodStart = rowPeriodStartYmd(u) ?? currentSubscriptionPeriodStartYmd();
  const cutsUsed = Math.max(0, Number(u.subscription_cuts_used ?? 0));
  const cutsRemaining = Math.max(0, plan.cutsPerMonth - cutsUsed);

  return {
    planId: plan.id,
    planName: plan.name,
    cutsPerMonth: plan.cutsPerMonth,
    cutsUsed,
    cutsRemaining,
    periodStart,
    periodEnd: subscriptionPeriodEndYmd(periodStart),
    monthlyPrice: plan.monthlyPrice,
  };
}

export function userHasActiveSubscriptionPlan(
  u: Pick<DbUser, 'subscription_plan_id'>
): boolean {
  return Boolean(u.subscription_plan_id?.trim());
}

/** Abono activo → sin seña en la web (además del flag manual deposit_exempt). */
export async function isClientDepositExempt(userId: number): Promise<boolean> {
  const rows = await query<Pick<DbUser, 'deposit_exempt' | 'subscription_plan_id'>[]>(
    'SELECT deposit_exempt, subscription_plan_id FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const u = rows[0];
  if (!u) return false;
  if (u.deposit_exempt === true || u.deposit_exempt === 1) return true;
  if (!u.subscription_plan_id) return false;
  const plan = await getSubscriptionPlanById(u.subscription_plan_id);
  return Boolean(plan?.active);
}

export async function assignSubscriptionPlanToClient(
  userId: number,
  planId: string | null
): Promise<void> {
  const user = await query<{ role: string }[]>('SELECT role FROM users WHERE id = ? LIMIT 1', [
    userId,
  ]);
  if (!user[0] || user[0].role !== 'client') {
    throw new Error('Cliente no encontrado');
  }

  if (planId == null || planId === '') {
    await query(
      `UPDATE users SET subscription_plan_id = NULL, subscription_period_start = NULL,
       subscription_cuts_used = 0, deposit_exempt = 0 WHERE id = ? AND role = 'client'`,
      [userId]
    );
    return;
  }

  const plan = await getSubscriptionPlanById(planId);
  if (!plan || !plan.active) {
    throw new Error('Plan de abono no encontrado o inactivo');
  }

  const periodStart = currentSubscriptionPeriodStartYmd();
  await query(
    `UPDATE users SET subscription_plan_id = ?, subscription_period_start = ?,
     subscription_cuts_used = 0, deposit_exempt = 1 WHERE id = ? AND role = 'client'`,
    [planId, periodStart, userId]
  );
}

/** Consume un corte del abono si hay cupo. Devuelve false si no aplica o no hay cortes. */
export async function tryConsumeSubscriptionCut(userId: number): Promise<boolean> {
  const status = await getClientSubscriptionStatus(userId);
  if (!status || status.cutsRemaining <= 0) return false;

  const [res] = await pool.execute(
    `UPDATE users SET subscription_cuts_used = subscription_cuts_used + 1
     WHERE id = ? AND role = 'client' AND subscription_plan_id = ?
       AND subscription_cuts_used < ?`,
    [userId, status.planId, status.cutsPerMonth]
  );
  return ((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function restoreSubscriptionCut(userId: number): Promise<void> {
  await query(
    `UPDATE users SET subscription_cuts_used = GREATEST(0, subscription_cuts_used - 1)
     WHERE id = ? AND role = 'client' AND subscription_cuts_used > 0`,
    [userId]
  );
}

export async function assertClientCanBookWithSubscription(userId: number): Promise<void> {
  const status = await getClientSubscriptionStatus(userId);
  if (!status) return;
  if (status.cutsRemaining <= 0) {
    throw new Error(
      `El abono «${status.planName}» no tiene cortes disponibles este mes (${status.cutsUsed}/${status.cutsPerMonth} usados).`
    );
  }
}

/** Al confirmar un turno (scheduled), descuenta un corte del abono si corresponde. */
export async function onAppointmentConfirmed(appointment: {
  id: string;
  userId?: number;
  status?: string;
  subscriptionCutApplied?: boolean;
}): Promise<void> {
  const uid = appointment.userId;
  if (uid == null || !Number.isFinite(Number(uid))) return;
  if ((appointment.status ?? 'scheduled') !== 'scheduled') return;
  if (appointment.subscriptionCutApplied) return;

  const consumed = await tryConsumeSubscriptionCut(Number(uid));
  if (consumed) {
    await query('UPDATE appointments SET subscription_cut_applied = 1 WHERE id = ?', [
      appointment.id,
    ]);
  }
}

/** Al cancelar un turno que había consumido un corte, lo devuelve al cupo mensual. */
export async function onAppointmentCancelled(appointment: {
  id: string;
  userId?: number;
  subscriptionCutApplied?: boolean;
}): Promise<void> {
  const uid = appointment.userId;
  if (uid == null || !appointment.subscriptionCutApplied) return;
  await restoreSubscriptionCut(Number(uid));
  await query('UPDATE appointments SET subscription_cut_applied = 0 WHERE id = ?', [
    appointment.id,
  ]);
}

export type { SubscriptionPlan };
