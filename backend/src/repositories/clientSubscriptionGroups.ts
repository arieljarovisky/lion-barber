import pool, { query } from '../db.js';

export type DbSubscriptionGroup = {
  id: number;
  subscription_plan_id: string;
  period_start: string | Date;
  cuts_used: number;
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

export async function getSubscriptionGroupById(
  groupId: number
): Promise<DbSubscriptionGroup | null> {
  const rows = await query<DbSubscriptionGroup[]>(
    `SELECT id, subscription_plan_id, period_start, cuts_used, owner_user_id
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
}): Promise<number> {
  const [res] = await pool.execute(
    `INSERT INTO client_subscription_groups
     (subscription_plan_id, period_start, cuts_used, owner_user_id)
     VALUES (?, ?, ?, ?)`,
    [
      data.planId,
      data.periodStart,
      Math.max(0, data.cutsUsed ?? 0),
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
  cutsPerMonth: number
): Promise<boolean> {
  const [res] = await pool.execute(
    `UPDATE client_subscription_groups SET cuts_used = cuts_used + 1
     WHERE id = ? AND subscription_plan_id = ? AND cuts_used < ?`,
    [groupId, planId, cutsPerMonth]
  );
  return ((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function decrementGroupCutsUsed(groupId: number): Promise<void> {
  await query(
    `UPDATE client_subscription_groups SET cuts_used = GREATEST(0, cuts_used - 1) WHERE id = ?`,
    [groupId]
  );
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
