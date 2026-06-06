import { query } from '../db.js';

export interface SitePromotion {
  id: string;
  title: string;
  description: string;
  badgeText: string;
  ctaLabel: string;
  ctaHref: string;
  active: boolean;
  sortOrder: number;
}

interface DbPromotion {
  id: string;
  title: string;
  description: string | null;
  badge_text: string | null;
  cta_label: string | null;
  cta_href: string | null;
  active: number | boolean;
  sort_order: number;
}

function rowToPromotion(r: DbPromotion): SitePromotion {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    badgeText: r.badge_text ?? '',
    ctaLabel: r.cta_label ?? '',
    ctaHref: r.cta_href ?? '',
    active: Boolean(r.active),
    sortOrder: r.sort_order,
  };
}

function slugFromTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 40) || 'promo'
  );
}

export async function getAllPromotions(): Promise<SitePromotion[]> {
  const rows = await query<DbPromotion[]>(
    'SELECT * FROM site_promotions ORDER BY sort_order ASC, title ASC'
  );
  return rows.map(rowToPromotion);
}

export async function getActivePromotions(): Promise<SitePromotion[]> {
  const rows = await query<DbPromotion[]>(
    'SELECT * FROM site_promotions WHERE active = 1 ORDER BY sort_order ASC, title ASC'
  );
  return rows.map(rowToPromotion);
}

export async function getPromotionById(id: string): Promise<SitePromotion | null> {
  const rows = await query<DbPromotion[]>('SELECT * FROM site_promotions WHERE id = ? LIMIT 1', [
    id,
  ]);
  const r = rows[0];
  return r ? rowToPromotion(r) : null;
}

export async function createPromotion(data: {
  title: string;
  description?: string;
  badgeText?: string;
  ctaLabel?: string;
  ctaHref?: string;
  active?: boolean;
}): Promise<SitePromotion> {
  let id = slugFromTitle(data.title);
  const existing = await getPromotionById(id);
  if (existing) {
    id = `${id}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const maxRows = await query<{ maxOrder: number | null }[]>(
    'SELECT MAX(sort_order) AS maxOrder FROM site_promotions'
  );
  const nextOrder = Number(maxRows[0]?.maxOrder ?? 0) + 1;
  await query(
    `INSERT INTO site_promotions
      (id, title, description, badge_text, cta_label, cta_href, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.title.trim(),
      (data.description ?? '').trim() || null,
      (data.badgeText ?? '').trim() || null,
      (data.ctaLabel ?? '').trim() || null,
      (data.ctaHref ?? '').trim() || null,
      data.active !== false ? 1 : 0,
      nextOrder,
    ]
  );
  const created = await getPromotionById(id);
  if (!created) throw new Error('Promoción no creada');
  return created;
}

export async function updatePromotion(
  id: string,
  data: Partial<
    Pick<
      SitePromotion,
      'title' | 'description' | 'badgeText' | 'ctaLabel' | 'ctaHref' | 'active' | 'sortOrder'
    >
  >
): Promise<SitePromotion | null> {
  const current = await getPromotionById(id);
  if (!current) return null;
  const updated = { ...current, ...data };
  await query(
    `UPDATE site_promotions SET title = ?, description = ?, badge_text = ?, cta_label = ?,
     cta_href = ?, active = ?, sort_order = ? WHERE id = ?`,
    [
      updated.title.trim(),
      updated.description.trim() || null,
      updated.badgeText.trim() || null,
      updated.ctaLabel.trim() || null,
      updated.ctaHref.trim() || null,
      updated.active ? 1 : 0,
      updated.sortOrder,
      id,
    ]
  );
  return getPromotionById(id);
}

export async function deletePromotion(id: string): Promise<boolean> {
  const res = await query<{ affectedRows: number }>('DELETE FROM site_promotions WHERE id = ?', [
    id,
  ]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

export async function getSubscriptionPaymentByMpId(
  mercadopagoPaymentId: string
): Promise<{ userId: number; planId: string } | null> {
  const rows = await query<{ user_id: number; plan_id: string }[]>(
    'SELECT user_id, plan_id FROM subscription_payment_events WHERE mercadopago_payment_id = ? LIMIT 1',
    [mercadopagoPaymentId]
  );
  const r = rows[0];
  if (!r) return null;
  return { userId: r.user_id, planId: r.plan_id };
}

export async function recordSubscriptionPayment(data: {
  mercadopagoPaymentId: string;
  userId: number;
  planId: string;
}): Promise<boolean> {
  try {
    await query(
      `INSERT INTO subscription_payment_events (mercadopago_payment_id, user_id, plan_id)
       VALUES (?, ?, ?)`,
      [data.mercadopagoPaymentId, data.userId, data.planId]
    );
    return true;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return false;
    throw e;
  }
}
