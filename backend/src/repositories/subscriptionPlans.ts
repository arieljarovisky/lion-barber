import { query } from '../db.js';

export interface SubscriptionPlan {
  id: string;
  name: string;
  /** Precio mensual referencia (texto, ej. "$80.000"). */
  monthlyPrice: string;
  cutsPerMonth: number;
  active: boolean;
  sortOrder: number;
}

interface DbPlan {
  id: string;
  name: string;
  monthly_price: string;
  cuts_per_month: number;
  active: number | boolean;
  sort_order: number;
}

function rowToPlan(r: DbPlan): SubscriptionPlan {
  return {
    id: r.id,
    name: r.name,
    monthlyPrice: r.monthly_price,
    cutsPerMonth: r.cuts_per_month,
    active: Boolean(r.active),
    sortOrder: r.sort_order,
  };
}

function slugFromName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 40) || 'plan'
  );
}

export async function getAllSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const rows = await query<DbPlan[]>(
    'SELECT * FROM subscription_plans ORDER BY sort_order ASC, name ASC'
  );
  return rows.map(rowToPlan);
}

export async function getActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const rows = await query<DbPlan[]>(
    'SELECT * FROM subscription_plans WHERE active = 1 ORDER BY sort_order ASC, name ASC'
  );
  return rows.map(rowToPlan);
}

export async function getSubscriptionPlanById(id: string): Promise<SubscriptionPlan | null> {
  const rows = await query<DbPlan[]>('SELECT * FROM subscription_plans WHERE id = ? LIMIT 1', [
    id,
  ]);
  const r = rows[0];
  return r ? rowToPlan(r) : null;
}

export async function createSubscriptionPlan(data: {
  name: string;
  monthlyPrice: string;
  cutsPerMonth: number;
  active?: boolean;
}): Promise<SubscriptionPlan> {
  let id = slugFromName(data.name);
  const existing = await getSubscriptionPlanById(id);
  if (existing) {
    id = `${id}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const maxRows = await query<{ maxOrder: number | null }[]>(
    'SELECT MAX(sort_order) AS maxOrder FROM subscription_plans'
  );
  const nextOrder = Number(maxRows[0]?.maxOrder ?? 0) + 1;
  const cuts = Math.max(1, Math.min(99, Math.floor(data.cutsPerMonth)));
  await query(
    'INSERT INTO subscription_plans (id, name, monthly_price, cuts_per_month, active, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [id, data.name.trim(), String(data.monthlyPrice).trim(), cuts, data.active !== false ? 1 : 0, nextOrder]
  );
  const created = await getSubscriptionPlanById(id);
  if (!created) throw new Error('Plan no creado');
  return created;
}

export async function updateSubscriptionPlan(
  id: string,
  data: Partial<Pick<SubscriptionPlan, 'name' | 'monthlyPrice' | 'cutsPerMonth' | 'active'>>
): Promise<SubscriptionPlan | null> {
  const current = await getSubscriptionPlanById(id);
  if (!current) return null;
  const updated = { ...current, ...data };
  const cuts = Math.max(1, Math.min(99, Math.floor(updated.cutsPerMonth)));
  await query(
    'UPDATE subscription_plans SET name = ?, monthly_price = ?, cuts_per_month = ?, active = ? WHERE id = ?',
    [
      updated.name.trim(),
      String(updated.monthlyPrice).trim(),
      cuts,
      updated.active ? 1 : 0,
      id,
    ]
  );
  return getSubscriptionPlanById(id);
}

export async function deleteSubscriptionPlan(id: string): Promise<boolean> {
  const inUse = await query<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM users WHERE subscription_plan_id = ?',
    [id]
  );
  if (Number(inUse[0]?.n) > 0) {
    throw new Error('No se puede eliminar: hay clientes con este plan asignado.');
  }
  const res = await query<{ affectedRows: number }>('DELETE FROM subscription_plans WHERE id = ?', [
    id,
  ]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
