import pool, { query } from '../db.js';

export type DbSubscriptionGroup = {
  id: number;
  subscription_plan_id: string;
  period_start: string | Date;
  cuts_used: number;
  /** Cupo total de cortes (puede ser mayor al plan si se apilaron compras). Null = usar cortes del plan. */
  cuts_allowance: number | null;
  owner_user_id: number | null;
};

export type SubscriptionGroupMember = {
  id: number;
  name: string;
  email: string;
};

function periodStartYmd(raw: string | Date | null | undefined): string | null {
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

/** Cupo efectivo: allowance guardado o, si es null, los cortes del plan. */
export function resolveCutsAllowance(
  group: Pick<DbSubscriptionGroup, 'cuts_allowance'>,
  planCutsPerMonth: number
): number {
  const stored = group.cuts_allowance;
  if (stored != null && Number.isFinite(Number(stored)) && Number(stored) > 0) {
    return Math.floor(Number(stored));
  }
  return Math.max(1, Math.floor(planCutsPerMonth));
}

export async function getSubscriptionGroupById(
  groupId: number
): Promise<DbSubscriptionGroup | null> {
  const rows = await query<DbSubscriptionGroup[]>(
    `SELECT id, subscription_plan_id, period_start, cuts_used, cuts_allowance, owner_user_id
     FROM client_subscription_groups WHERE id = ? LIMIT 1`,
    [groupId]
  );
  return rows[0] ?? null;
}

export async function getSubscriptionGroupIdForUser(userId: number): Promise<number | null> {
  const rows = await query<{ subscription_group_id: number | null }[]>(
    'SELECT subscription_group_id FROM users WHERE id = ? AND role = ? LIMIT 1',
    [userId, 'client']
  );
  const gid = rows[0]?.subscription_group_id;
  return gid != null && Number.isFinite(Number(gid)) ? Number(gid) : null;
}

export async function createSubscriptionGroup(data: {
  planId: string;
  periodStart: string;
  ownerUserId: number;
  cutsUsed?: number;
  cutsAllowance?: number;
}): Promise<number> {
  const allowance =
    data.cutsAllowance != null && Number.isFinite(data.cutsAllowance) && data.cutsAllowance > 0
      ? Math.floor(data.cutsAllowance)
      : null;
  const [res] = await pool.execute(
    `INSERT INTO client_subscription_groups
     (subscription_plan_id, period_start, cuts_used, cuts_allowance, owner_user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.planId,
      data.periodStart,
      Math.max(0, data.cutsUsed ?? 0),
      allowance,
      data.ownerUserId,
    ]
  );
  return (res as { insertId: number }).insertId;
}

export async function linkUserToGroup(userId: number, groupId: number): Promise<void> {
  await query(
    `UPDATE users SET subscription_group_id = ?, subscription_plan_id = NULL,
     subscription_period_start = NULL, subscription_cuts_used = 0, deposit_exempt = 1
     WHERE id = ? AND role = 'client'`,
    [groupId, userId]
  );
}

export async function unlinkUserFromGroup(userId: number): Promise<void> {
  await query(
    `UPDATE users SET subscription_group_id = NULL, subscription_plan_id = NULL,
     subscription_period_start = NULL, subscription_cuts_used = 0, deposit_exempt = 0
     WHERE id = ? AND role = 'client'`,
    [userId]
  );
}

export async function countGroupMembers(groupId: number): Promise<number> {
  const rows = await query<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM users WHERE subscription_group_id = ? AND role = ?',
    [groupId, 'client']
  );
  return Number(rows[0]?.n ?? 0);
}

export async function deleteSubscriptionGroup(groupId: number): Promise<void> {
  await query('UPDATE users SET subscription_group_id = NULL, deposit_exempt = 0 WHERE subscription_group_id = ?', [
    groupId,
  ]);
  await query('DELETE FROM client_subscription_groups WHERE id = ?', [groupId]);
}

export async function listSubscriptionGroupMembers(
  groupId: number
): Promise<SubscriptionGroupMember[]> {
  return query<SubscriptionGroupMember[]>(
    `SELECT id, name, email FROM users
     WHERE subscription_group_id = ? AND role = 'client'
     ORDER BY id ASC`,
    [groupId]
  );
}

export async function incrementGroupCutsUsed(
  groupId: number,
  planId: string,
  cutsAllowance: number
): Promise<boolean> {
  const [res] = await pool.execute(
    `UPDATE client_subscription_groups SET cuts_used = cuts_used + 1
     WHERE id = ? AND subscription_plan_id = ? AND cuts_used < ?`,
    [groupId, planId, cutsAllowance]
  );
  return ((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function decrementGroupCutsUsed(groupId: number): Promise<void> {
  await query(
    `UPDATE client_subscription_groups SET cuts_used = GREATEST(0, cuts_used - 1) WHERE id = ?`,
    [groupId]
  );
}

export async function setGroupSubscriptionUsage(
  groupId: number,
  data: { cutsUsed?: number; periodStart?: string; cutsAllowance?: number; planId?: string }
): Promise<void> {
  const sets: string[] = [];
  const params: (number | string)[] = [];

  if (data.cutsUsed !== undefined) {
    sets.push('cuts_used = ?');
    params.push(Math.max(0, Math.floor(data.cutsUsed)));
  }
  if (data.periodStart !== undefined) {
    sets.push('period_start = ?');
    params.push(data.periodStart.slice(0, 10));
  }
  if (data.cutsAllowance !== undefined) {
    sets.push('cuts_allowance = ?');
    params.push(Math.max(1, Math.floor(data.cutsAllowance)));
  }
  if (data.planId !== undefined) {
    sets.push('subscription_plan_id = ?');
    params.push(data.planId);
  }
  if (sets.length === 0) return;

  params.push(groupId);
  await query(`UPDATE client_subscription_groups SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** Suma cortes al cupo de un abono vigente (compra o asignación apilada). */
export async function addCutsToGroupAllowance(
  groupId: number,
  data: {
    cutsToAdd: number;
    planId: string;
    periodStart: string;
    currentAllowance: number;
  }
): Promise<void> {
  const nextAllowance = Math.max(1, Math.floor(data.currentAllowance) + Math.floor(data.cutsToAdd));
  await setGroupSubscriptionUsage(groupId, {
    cutsAllowance: nextAllowance,
    planId: data.planId,
    periodStart: data.periodStart,
  });
}

export async function userHasAnySubscriptionLink(userId: number): Promise<boolean> {
  const rows = await query<
    { subscription_group_id: number | null; subscription_plan_id: string | null }[]
  >(
    'SELECT subscription_group_id, subscription_plan_id FROM users WHERE id = ? AND role = ? LIMIT 1',
    [userId, 'client']
  );
  const u = rows[0];
  if (!u) return false;
  return Boolean(u.subscription_group_id) || Boolean(u.subscription_plan_id?.trim());
}

export async function migrateLegacyUserSubscriptionToGroup(userId: number): Promise<number | null> {
  const rows = await query<
    {
      subscription_group_id: number | null;
      subscription_plan_id: string | null;
      subscription_period_start: string | Date | null;
      subscription_cuts_used: number;
    }[]
  >(
    `SELECT subscription_group_id, subscription_plan_id, subscription_period_start, subscription_cuts_used
     FROM users WHERE id = ? AND role = 'client' LIMIT 1`,
    [userId]
  );
  const u = rows[0];
  if (!u?.subscription_plan_id?.trim()) return null;
  if (u.subscription_group_id != null) return Number(u.subscription_group_id);

  const periodStart = periodStartYmd(u.subscription_period_start) ?? new Date().toISOString().slice(0, 10);
  const groupId = await createSubscriptionGroup({
    planId: u.subscription_plan_id.trim(),
    periodStart,
    ownerUserId: userId,
    cutsUsed: Math.max(0, Number(u.subscription_cuts_used ?? 0)),
  });
  await linkUserToGroup(userId, groupId);
  return groupId;
}

export { periodStartYmd };
