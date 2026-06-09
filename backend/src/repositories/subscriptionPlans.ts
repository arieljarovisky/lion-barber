import { query } from '../db.js';

export interface SubscriptionPlan {
  id: string;
  name: string;
  /** Precio de referencia del plan (texto, ej. "$80.000"). */
  monthlyPrice: string;
  cutsPerMonth: number;
  active: boolean;
  sortOrder: number;
  /** Días de vigencia desde la activación; null = sin vencimiento por fecha. */
  validityDays: number | null;
  description: string;
  category: string;
  compareAtPrice: string;
  discountLabel: string;
  bonusText: string;
  features: string[];
  highlighted: boolean;
  badgeText: string;
}

interface DbPlan {
  id: string;
  name: string;
  monthly_price: string;
  cuts_per_month: number;
  active: number | boolean;
  sort_order: number;
  description?: string | null;
  category?: string | null;
  compare_at_price?: string | null;
  discount_label?: string | null;
  bonus_text?: string | null;
  features?: unknown;
  highlighted?: number | boolean | null;
  badge_text?: string | null;
  validity_days?: number | null;
}

function parseFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      }
    } catch {
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function defaultFeatures(cutsPerMonth: number): string[] {
  return [
    `${cutsPerMonth} corte${cutsPerMonth === 1 ? '' : 's'} incluido${cutsPerMonth === 1 ? '' : 's'}`,
    'Sin seña en cada reserva',
    'Reservá online cuando quieras',
  ];
}

export function resolvePlanFeatures(plan: Pick<SubscriptionPlan, 'features' | 'cutsPerMonth'>): string[] {
  if (plan.features.length > 0) return plan.features;
  return defaultFeatures(plan.cutsPerMonth);
}

function rowToPlan(r: DbPlan): SubscriptionPlan {
  const cutsPerMonth = r.cuts_per_month;
  const features = parseFeatures(r.features);
  return {
    id: r.id,
    name: r.name,
    monthlyPrice: r.monthly_price,
    cutsPerMonth,
    active: Boolean(r.active),
    sortOrder: r.sort_order,
    description: r.description ?? '',
    category: (r.category ?? 'Abono').replace(/^Abono mensual$/i, 'Abono'),
    compareAtPrice: r.compare_at_price ?? '',
    discountLabel: r.discount_label ?? '',
    bonusText: r.bonus_text ?? '',
    features: features.length > 0 ? features : defaultFeatures(cutsPerMonth),
    highlighted: Boolean(r.highlighted),
    badgeText: r.badge_text ?? '',
    validityDays:
      r.validity_days != null && Number.isFinite(Number(r.validity_days)) && Number(r.validity_days) > 0
        ? Math.floor(Number(r.validity_days))
        : null,
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

function serializeFeatures(features: string[] | undefined): string | null {
  if (!features || features.length === 0) return null;
  const cleaned = features.map((f) => f.trim()).filter(Boolean);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
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
  description?: string;
  category?: string;
  compareAtPrice?: string;
  discountLabel?: string;
  bonusText?: string;
  features?: string[];
  highlighted?: boolean;
  badgeText?: string;
  validityDays?: number | null;
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
  const validityDays =
    data.validityDays != null && Number.isFinite(Number(data.validityDays)) && Number(data.validityDays) > 0
      ? Math.min(999, Math.floor(Number(data.validityDays)))
      : null;
  await query(
    `INSERT INTO subscription_plans
      (id, name, monthly_price, cuts_per_month, active, sort_order, description, category,
       compare_at_price, discount_label, bonus_text, features, highlighted, badge_text, validity_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name.trim(),
      String(data.monthlyPrice).trim(),
      cuts,
      data.active !== false ? 1 : 0,
      nextOrder,
      (data.description ?? '').trim() || null,
      (data.category ?? 'Abono').trim() || 'Abono',
      (data.compareAtPrice ?? '').trim() || null,
      (data.discountLabel ?? '').trim() || null,
      (data.bonusText ?? '').trim() || null,
      serializeFeatures(data.features),
      data.highlighted ? 1 : 0,
      (data.badgeText ?? '').trim() || null,
      validityDays,
    ]
  );
  const created = await getSubscriptionPlanById(id);
  if (!created) throw new Error('Plan no creado');
  return created;
}

export async function updateSubscriptionPlan(
  id: string,
  data: Partial<
    Pick<
      SubscriptionPlan,
      | 'name'
      | 'monthlyPrice'
      | 'cutsPerMonth'
      | 'active'
      | 'description'
      | 'category'
      | 'compareAtPrice'
      | 'discountLabel'
      | 'bonusText'
      | 'features'
      | 'highlighted'
      | 'badgeText'
      | 'validityDays'
      | 'sortOrder'
    >
  >
): Promise<SubscriptionPlan | null> {
  const current = await getSubscriptionPlanById(id);
  if (!current) return null;
  const updated = { ...current, ...data };
  const cuts = Math.max(1, Math.min(99, Math.floor(updated.cutsPerMonth)));
  const validityDays =
    updated.validityDays != null &&
    Number.isFinite(Number(updated.validityDays)) &&
    Number(updated.validityDays) > 0
      ? Math.min(999, Math.floor(Number(updated.validityDays)))
      : null;
  await query(
    `UPDATE subscription_plans SET name = ?, monthly_price = ?, cuts_per_month = ?, active = ?,
     description = ?, category = ?, compare_at_price = ?, discount_label = ?, bonus_text = ?,
     features = ?, highlighted = ?, badge_text = ?, validity_days = ?, sort_order = ? WHERE id = ?`,
    [
      updated.name.trim(),
      String(updated.monthlyPrice).trim(),
      cuts,
      updated.active ? 1 : 0,
      updated.description.trim() || null,
      updated.category.trim() || 'Abono',
      updated.compareAtPrice.trim() || null,
      updated.discountLabel.trim() || null,
      updated.bonusText.trim() || null,
      serializeFeatures(updated.features),
      updated.highlighted ? 1 : 0,
      updated.badgeText.trim() || null,
      validityDays,
      updated.sortOrder,
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
