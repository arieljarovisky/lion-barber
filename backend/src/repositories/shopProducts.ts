import { query } from '../db.js';
import type { ShopProduct } from '../types.js';

interface DbShopProduct {
  id: string;
  name: string;
  points_reward: number;
  sort_order: number;
}

function rowToProduct(r: DbShopProduct): ShopProduct {
  return {
    id: r.id,
    name: r.name,
    pointsReward: r.points_reward,
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
      .slice(0, 40) || 'producto'
  );
}

export async function getAllShopProducts(): Promise<ShopProduct[]> {
  const rows = await query<DbShopProduct[]>('SELECT * FROM shop_products ORDER BY sort_order ASC, name ASC');
  return rows.map(rowToProduct);
}

export async function getShopProductById(id: string): Promise<ShopProduct | null> {
  const rows = await query<DbShopProduct[]>('SELECT * FROM shop_products WHERE id = ? LIMIT 1', [id]);
  const r = rows[0];
  return r ? rowToProduct(r) : null;
}

export async function createShopProduct(data: { name: string; pointsReward: number }): Promise<ShopProduct> {
  let id = slugFromName(data.name);
  const existing = await getShopProductById(id);
  if (existing) {
    id = `${id}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const maxRows = await query<{ maxOrder: number | null }[]>('SELECT MAX(sort_order) AS maxOrder FROM shop_products');
  const nextOrder = Number(maxRows[0]?.maxOrder ?? 0) + 1;
  const pts = Math.max(0, Math.min(999_999, Math.floor(data.pointsReward)));
  await query(
    'INSERT INTO shop_products (id, name, points_reward, sort_order) VALUES (?, ?, ?, ?)',
    [id, data.name.trim(), pts, nextOrder]
  );
  const created = await getShopProductById(id);
  if (!created) throw new Error('Producto no creado');
  return created;
}

export async function updateShopProduct(
  id: string,
  data: Partial<Pick<ShopProduct, 'name' | 'pointsReward'>>
): Promise<ShopProduct | null> {
  const current = await getShopProductById(id);
  if (!current) return null;
  const name = data.name !== undefined ? data.name.trim() : current.name;
  const pointsReward =
    data.pointsReward !== undefined
      ? Math.max(0, Math.min(999_999, Math.floor(data.pointsReward)))
      : current.pointsReward;
  await query('UPDATE shop_products SET name = ?, points_reward = ? WHERE id = ?', [name, pointsReward, id]);
  return getShopProductById(id);
}

export async function deleteShopProduct(id: string): Promise<boolean> {
  const res = await query<{ affectedRows: number }>('DELETE FROM shop_products WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
