import pool, { query } from '../db.js';
import type { DbUser } from '../repositories/users.js';
import type { Appointment, ServicePaymentSplit } from '../types.js';
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
  /** Fecha de activación del abono (YYYY-MM-DD). */
  periodStart: string;
  /** Fecha de vencimiento solo si el plan tiene vigencia configurada; si no, null. */
  periodEnd: string | null;
  validityDays: number | null;
  monthlyPrice: string;
}

/** Fecha calendario actual en Argentina (YYYY-MM-DD). */
export function currentArgentinaYmd(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Suma días calendario a una fecha YYYY-MM-DD. */
export function addDaysYmd(startYmd: string, days: number): string {
  const [y, m, d] = startYmd.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function subscriptionExpiresAtYmd(
  activatedAt: string,
  validityDays: number | null | undefined
): string | null {
  if (validityDays == null || !Number.isFinite(validityDays) || validityDays <= 0) return null;
  return addDaysYmd(activatedAt, Math.floor(validityDays));
}

export function isSubscriptionExpiredByDate(
  activatedAt: string,
  validityDays: number | null | undefined
): boolean {
  const expiresAt = subscriptionExpiresAtYmd(activatedAt, validityDays);
  if (!expiresAt) return false;
  return currentArgentinaYmd() > expiresAt;
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

async function expireClientSubscription(userId: number): Promise<void> {
  await query(
    `UPDATE users SET subscription_plan_id = NULL, subscription_period_start = NULL,
     subscription_cuts_used = 0, deposit_exempt = 0 WHERE id = ? AND role = 'client'`,
    [userId]
  );
}

async function maybeExpireClientSubscription(
  userId: number,
  plan: SubscriptionPlan,
  activatedAt: string,
  cutsUsed: number
): Promise<boolean> {
  if (isSubscriptionExpiredByDate(activatedAt, plan.validityDays)) {
    await expireClientSubscription(userId);
    return true;
  }
  if (cutsUsed >= plan.cutsPerMonth) {
    await expireClientSubscription(userId);
    return true;
  }
  return false;
}

export async function getClientSubscriptionStatus(
  userId: number
): Promise<ClientSubscriptionStatus | null> {
  const rows = await query<DbUserSubscription[]>(
    `SELECT id, subscription_plan_id, subscription_period_start, subscription_cuts_used
     FROM users WHERE id = ? AND role = 'client' LIMIT 1`,
    [userId]
  );
  const u = rows[0];
  if (!u?.subscription_plan_id) return null;

  const plan = await getSubscriptionPlanById(u.subscription_plan_id);
  if (!plan || !plan.active) return null;

  const activatedAt = rowPeriodStartYmd(u) ?? currentArgentinaYmd();
  const cutsUsed = Math.max(0, Number(u.subscription_cuts_used ?? 0));

  if (await maybeExpireClientSubscription(userId, plan, activatedAt, cutsUsed)) {
    return null;
  }

  const cutsRemaining = Math.max(0, plan.cutsPerMonth - cutsUsed);

  return {
    planId: plan.id,
    planName: plan.name,
    cutsPerMonth: plan.cutsPerMonth,
    cutsUsed,
    cutsRemaining,
    periodStart: activatedAt,
    periodEnd: subscriptionExpiresAtYmd(activatedAt, plan.validityDays),
    validityDays: plan.validityDays ?? null,
    monthlyPrice: plan.monthlyPrice,
  };
}

export function userHasActiveSubscriptionPlan(
  u: Pick<DbUser, 'subscription_plan_id'>
): boolean {
  return Boolean(u.subscription_plan_id?.trim());
}

/** Abono activo con cortes disponibles → sin seña en la web (además del flag manual deposit_exempt). */
export async function isClientDepositExempt(userId: number): Promise<boolean> {
  const rows = await query<Pick<DbUser, 'deposit_exempt' | 'subscription_plan_id'>[]>(
    'SELECT deposit_exempt, subscription_plan_id FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const u = rows[0];
  if (!u) return false;
  if (u.deposit_exempt === true || u.deposit_exempt === 1) return true;
  const status = await getClientSubscriptionStatus(userId);
  return status != null && status.cutsRemaining > 0;
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
    await expireClientSubscription(userId);
    return;
  }

  const plan = await getSubscriptionPlanById(planId);
  if (!plan || !plan.active) {
    throw new Error('Plan de abono no encontrado o inactivo');
  }

  const activatedAt = currentArgentinaYmd();
  await query(
    `UPDATE users SET subscription_plan_id = ?, subscription_period_start = ?,
     subscription_cuts_used = 0, deposit_exempt = 1 WHERE id = ? AND role = 'client'`,
    [planId, activatedAt, userId]
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
  const ok = ((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
  if (ok && status.cutsRemaining === 1) {
    await expireClientSubscription(userId);
  }
  return ok;
}

export async function restoreSubscriptionCut(userId: number): Promise<void> {
  const rows = await query<DbUserSubscription[]>(
    `SELECT id, subscription_plan_id, subscription_period_start, subscription_cuts_used
     FROM users WHERE id = ? AND role = 'client' LIMIT 1`,
    [userId]
  );
  const u = rows[0];
  if (!u?.subscription_plan_id) return;

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
      `El abono «${status.planName}» no tiene cortes disponibles (${status.cutsUsed}/${status.cutsPerMonth} usados).`
    );
  }
}

function splitsUseSubscription(splits: ServicePaymentSplit[] | null | undefined): boolean {
  return Boolean(splits?.some((s) => s.method === 'subscription' && s.amount > 0));
}

/**
 * Descuenta o devuelve un corte del abono según si el cobro usa método «Abono».
 * Debe ejecutarse antes de persistir servicePaymentSplits.
 */
export async function syncSubscriptionCutWithPayment(
  appointment: Appointment,
  newSplits: ServicePaymentSplit[] | null | undefined
): Promise<void> {
  const wasApplied = Boolean(appointment.subscriptionCutApplied);
  const usesNow = splitsUseSubscription(newSplits);

  if (usesNow && !wasApplied) {
    const uid = appointment.userId;
    if (uid == null || !Number.isFinite(Number(uid))) {
      throw new Error('Vinculá el turno al cliente para cobrar con abono.');
    }
    const consumed = await tryConsumeSubscriptionCut(Number(uid));
    if (!consumed) {
      throw new Error('El abono no tiene cortes disponibles.');
    }
    await query('UPDATE appointments SET subscription_cut_applied = 1 WHERE id = ?', [
      appointment.id,
    ]);
  } else if (!usesNow && wasApplied) {
    const uid = appointment.userId;
    if (uid != null && Number.isFinite(Number(uid))) {
      await restoreSubscriptionCut(Number(uid));
    }
    await query('UPDATE appointments SET subscription_cut_applied = 0 WHERE id = ?', [
      appointment.id,
    ]);
  }
}

/** Reservado para efectos al confirmar; el corte se descuenta al cobrar con método Abono. */
export async function onAppointmentConfirmed(_appointment: {
  id: string;
  userId?: number;
  status?: string;
  subscriptionCutApplied?: boolean;
}): Promise<void> {
  /* sin consumo automático */
}

/** Al cancelar un turno que había consumido un corte, lo devuelve al cupo del abono. */
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
