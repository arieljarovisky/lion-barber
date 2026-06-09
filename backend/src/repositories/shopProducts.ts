import { query } from '../db.js';
import type { ShopProduct } from '../types.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

interface DbShopProduct {
  id: string;
  name: string;
  points_reward: number;
  sort_order: number;
  unit_price?: string | null;
  image_url?: string | null;
  image_data?: string | null;
  has_image?: number | boolean | null;
  description?: string | null;
  web_active?: number | boolean | null;
}

export function productImageApiPath(productId: string): string {
  return `/api/shop-products/${encodeURIComponent(productId)}/image`;
}

function productRowHasImage(r: DbShopProduct): boolean {
  if (r.has_image != null) return Boolean(r.has_image);
  return r.image_data != null && String(r.image_data).trim() !== '';
}

function resolvePublicImageUrl(r: DbShopProduct): string | undefined {
  if (productRowHasImage(r)) {
    return productImageApiPath(r.id);
  }
  return undefined;
}

function rowToProduct(r: DbShopProduct): ShopProduct {
  return {
    id: r.id,
    name: r.name,
    pointsReward: r.points_reward,
    unitPrice:
      r.unit_price != null && String(r.unit_price).trim() !== '' ? String(r.unit_price).trim() : undefined,
    sortOrder: r.sort_order,
    imageUrl: resolvePublicImageUrl(r),
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

export function parseProductImageDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Formato de imagen no válido. Usá JPG, PNG o WebP.');
  }
  const subtype = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new Error('La imagen está vacía.');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('La imagen supera el máximo de 2 MB.');
  }
  return { mime: `image/${subtype}`, buffer };
}

/** Columnas de listado sin cargar el blob completo de la imagen. */
const PRODUCT_LIST_COLUMNS = `
  id, name, points_reward, sort_order, unit_price, image_url, description, web_active,
  (image_data IS NOT NULL AND CHAR_LENGTH(image_data) > 0) AS has_image
`;

export async function getAllShopProducts(): Promise<ShopProduct[]> {
  const rows = await query<DbShopProduct[]>(
    `SELECT ${PRODUCT_LIST_COLUMNS} FROM shop_products ORDER BY sort_order ASC, name ASC`
  );
  return rows.map(rowToProduct);
}

export async function getWebShopProducts(): Promise<ShopProduct[]> {
  const rows = await query<DbShopProduct[]>(
    `SELECT ${PRODUCT_LIST_COLUMNS}
     FROM shop_products
     WHERE web_active = 1 AND unit_price IS NOT NULL AND TRIM(unit_price) <> ''
     ORDER BY sort_order ASC, name ASC`
  );
  return rows.map(rowToProduct);
}

export async function getShopProductById(id: string): Promise<ShopProduct | null> {
  const rows = await query<DbShopProduct[]>(
    `SELECT ${PRODUCT_LIST_COLUMNS} FROM shop_products WHERE id = ? LIMIT 1`,
    [id]
  );
  const r = rows[0];
  return r ? rowToProduct(r) : null;
}

export async function getProductImagePayload(
  id: string
): Promise<{ mime: string; buffer: Buffer } | null> {
  const rows = await query<{ image_data: string | null }[]>(
    'SELECT image_data FROM shop_products WHERE id = ? LIMIT 1',
    [id]
  );
  const raw = rows[0]?.image_data;
  if (!raw || !String(raw).trim()) return null;
  try {
    return parseProductImageDataUrl(String(raw));
  } catch {
    return null;
  }
}

export async function setProductImageData(id: string, dataUrl: string): Promise<void> {
  const normalized = dataUrl.trim();
  parseProductImageDataUrl(normalized);
  await query('UPDATE shop_products SET image_data = ?, image_url = NULL WHERE id = ?', [
    normalized,
    id,
  ]);
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
  await query(
    `INSERT INTO shop_products
      (id, name, points_reward, sort_order, unit_price, description, web_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name.trim(), pts, nextOrder, up, desc, data.webActive !== false ? 1 : 0]
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

  if (data.imageUrl === null) {
    await query('UPDATE shop_products SET image_data = NULL, image_url = NULL WHERE id = ?', [id]);
  }

  await query(
    `UPDATE shop_products SET name = ?, points_reward = ?, unit_price = ?,
     description = ?, web_active = ? WHERE id = ?`,
    [name, pointsReward, unitPrice, description, webActive ? 1 : 0, id]
  );
  return getShopProductById(id);
}

export async function deleteShopProduct(id: string): Promise<boolean> {
  const res = await query<{ affectedRows: number }>('DELETE FROM shop_products WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
