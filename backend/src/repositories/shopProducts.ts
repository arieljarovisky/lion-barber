import { query } from '../db.js';
import type { ShopProduct } from '../types.js';

interface DbShopProduct {
  id: string;
  name: string;
  points_reward: number;
  sort_order: number;
  unit_price?: string | null;
  image_url?: string | null;
  description?: string | null;
  web_active?: number | boolean | null;
}

function rowToProduct(r: DbShopProduct): ShopProduct {
  return {
    id: r.id,
    name: r.name,
    pointsReward: r.points_reward,
    unitPrice:
      r.unit_price != null && String(r.unit_price).trim() !== '' ? String(r.unit_price).trim() : undefined,
    sortOrder: r.sort_order,
    imageUrl: r.image_url != null && String(r.image_url).trim() !== '' ? String(r.image_url).trim() : undefined,
    description:
      r.description != null && String(r.description).trim() !== '' ? String(r.description).trim() : undefined,
    webActive: r.web_active == null ? true : Boolean(r.web_active),
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
  const rows = await query<DbShopProduct[]>(
    'SELECT * FROM shop_products ORDER BY sort_order ASC, name ASC'
  );
  return rows.map(rowToProduct);
}

export async function getWebShopProducts(): Promise<ShopProduct[]> {
  const rows = await query<DbShopProduct[]>(
    `SELECT * FROM shop_products
     WHERE web_active = 1 AND unit_price IS NOT NULL AND TRIM(unit_price) <> ''
     ORDER BY sort_order ASC, name ASC`
  );
  return rows.map(rowToProduct);
}

export async function getShopProductById(id: string): Promise<ShopProduct | null> {
  const rows = await query<DbShopProduct[]>('SELECT * FROM shop_products WHERE id = ? LIMIT 1', [id]);
  const r = rows[0];
  return r ? rowToProduct(r) : null;
}

export async function createShopProduct(data: {
  name: string;
  pointsReward: number;
  unitPrice?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  webActive?: boolean;
}): Promise<ShopProduct> {
  let id = slugFromName(data.name);
  const existing = await getShopProductById(id);
  if (existing) {
    id = `${id}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const maxRows = await query<{ maxOrder: number | null }[]>(
    'SELECT MAX(sort_order) AS maxOrder FROM shop_products'
  );
  const nextOrder = Number(maxRows[0]?.maxOrder ?? 0) + 1;
  const pts = Math.max(0, Math.min(999_999, Math.floor(data.pointsReward)));
  const up =
    data.unitPrice != null && String(data.unitPrice).trim() !== '' ? String(data.unitPrice).trim() : null;
  const desc =
    data.description != null && String(data.description).trim() !== ''
      ? String(data.description).trim()
      : null;
  const img =
    data.imageUrl != null && String(data.imageUrl).trim() !== ''
      ? String(data.imageUrl).trim()
      : null;
  await query(
    `INSERT INTO shop_products
      (id, name, points_reward, sort_order, unit_price, image_url, description, web_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name.trim(), pts, nextOrder, up, img, desc, data.webActive !== false ? 1 : 0]
  );
  const created = await getShopProductById(id);
  if (!created) throw new Error('Producto no creado');
  return created;
}

export async function updateShopProduct(
  id: string,
  data: Partial<
    Pick<ShopProduct, 'name' | 'pointsReward' | 'unitPrice' | 'imageUrl' | 'description' | 'webActive'>
  >
): Promise<ShopProduct | null> {
  const current = await getShopProductById(id);
  if (!current) return null;
  const name = data.name !== undefined ? data.name.trim() : current.name;
  const pointsReward =
    data.pointsReward !== undefined
      ? Math.max(0, Math.min(999_999, Math.floor(data.pointsReward)))
      : current.pointsReward;
  let unitPrice: string | null;
  if (data.unitPrice !== undefined) {
    unitPrice =
      data.unitPrice != null && String(data.unitPrice).trim() !== '' ? String(data.unitPrice).trim() : null;
  } else {
    unitPrice =
      current.unitPrice != null && String(current.unitPrice).trim() !== ''
        ? String(current.unitPrice).trim()
        : null;
  }
  let imageUrl: string | null;
  if (data.imageUrl !== undefined) {
    imageUrl =
      data.imageUrl != null && String(data.imageUrl).trim() !== '' ? String(data.imageUrl).trim() : null;
  } else {
    imageUrl =
      current.imageUrl != null && String(current.imageUrl).trim() !== ''
        ? String(current.imageUrl).trim()
        : null;
  }
  let description: string | null;
  if (data.description !== undefined) {
    description =
      data.description != null && String(data.description).trim() !== ''
        ? String(data.description).trim()
        : null;
  } else {
    description =
      current.description != null && String(current.description).trim() !== ''
        ? String(current.description).trim()
        : null;
  }
  const webActive = data.webActive !== undefined ? Boolean(data.webActive) : Boolean(current.webActive);
  await query(
    `UPDATE shop_products SET name = ?, points_reward = ?, unit_price = ?, image_url = ?,
     description = ?, web_active = ? WHERE id = ?`,
    [name, pointsReward, unitPrice, imageUrl, description, webActive ? 1 : 0, id]
  );
  return getShopProductById(id);
}

export async function deleteShopProduct(id: string): Promise<boolean> {
  const res = await query<{ affectedRows: number }>('DELETE FROM shop_products WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
