import pool, { query } from '../db.js';
import type { ProductPurchase } from '../types.js';
import { getShopProductById } from './shopProducts.js';

interface DbProductPurchase {
  id: number;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: string | number;
  total_cost: string | number;
  purchase_date: string | Date;
  notes?: string | null;
  created_by_user_id?: number | null;
  created_at: string | Date;
}

function parseDecimal(raw: string | number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function rowToPurchase(r: DbProductPurchase): ProductPurchase {
  const d = r.purchase_date;
  const purchaseDate =
    typeof d === 'string'
      ? d.slice(0, 10)
      : d instanceof Date
        ? d.toISOString().slice(0, 10)
        : String(d).slice(0, 10);
  const createdAt =
    typeof r.created_at === 'string'
      ? r.created_at
      : r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at);
  return {
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    quantity: Math.max(1, Math.floor(Number(r.quantity))),
    unitCost: parseDecimal(r.unit_cost),
    totalCost: parseDecimal(r.total_cost),
    purchaseDate,
    notes: r.notes ?? null,
    createdByUserId: r.created_by_user_id ?? null,
    createdAt,
  };
}

export async function listProductPurchasesInRange(
  fromYmd: string,
  toYmd: string
): Promise<ProductPurchase[]> {
  const rows = await query<DbProductPurchase[]>(
    `SELECT id, product_id, product_name, quantity, unit_cost, total_cost, purchase_date, notes, created_by_user_id, created_at
     FROM product_purchases
     WHERE purchase_date >= ? AND purchase_date <= ?
     ORDER BY purchase_date DESC, id DESC`,
    [fromYmd, toYmd]
  );
  return rows.map(rowToPurchase);
}

export async function getProductPurchaseById(id: number): Promise<ProductPurchase | null> {
  const rows = await query<DbProductPurchase[]>(
    'SELECT id, product_id, product_name, quantity, unit_cost, total_cost, purchase_date, notes, created_by_user_id, created_at FROM product_purchases WHERE id = ?',
    [id]
  );
  return rows[0] ? rowToPurchase(rows[0]) : null;
}

export async function createProductPurchase(data: {
  productId: string;
  quantity: number;
  unitCost: number;
  purchaseDate: string;
  notes?: string | null;
  createdByUserId?: number | null;
}): Promise<ProductPurchase> {
  const date = String(data.purchaseDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida.');

  const product = await getShopProductById(data.productId);
  if (!product) throw new Error('Producto no encontrado.');

  const quantity = Math.max(1, Math.floor(Number(data.quantity)));
  const unitCost = parseDecimal(data.unitCost);
  if (unitCost <= 0) throw new Error('El costo unitario debe ser mayor a 0.');

  const totalCost = Math.round(quantity * unitCost * 100) / 100;
  const notes = data.notes != null && String(data.notes).trim() !== '' ? String(data.notes).trim() : null;

  const [res] = await pool.execute(
    `INSERT INTO product_purchases (product_id, product_name, quantity, unit_cost, total_cost, purchase_date, notes, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.productId, product.name, quantity, unitCost, totalCost, date, notes, data.createdByUserId ?? null]
  );
  const id = (res as { insertId: number }).insertId;
  const created = await getProductPurchaseById(id);
  if (!created) throw new Error('No se pudo crear la compra.');
  return created;
}

export async function updateProductPurchase(
  id: number,
  data: Partial<{
    productId: string;
    quantity: number;
    unitCost: number;
    purchaseDate: string;
    notes: string | null;
  }>
): Promise<ProductPurchase | null> {
  const current = await getProductPurchaseById(id);
  if (!current) return null;

  let productId = current.productId;
  let productName = current.productName;
  if (data.productId !== undefined && data.productId !== current.productId) {
    const product = await getShopProductById(data.productId);
    if (!product) throw new Error('Producto no encontrado.');
    productId = data.productId;
    productName = product.name;
  }

  let purchaseDate = current.purchaseDate;
  if (data.purchaseDate !== undefined) {
    const date = String(data.purchaseDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida.');
    purchaseDate = date;
  }

  const quantity =
    data.quantity !== undefined ? Math.max(1, Math.floor(Number(data.quantity))) : current.quantity;
  let unitCost = current.unitCost;
  if (data.unitCost !== undefined) {
    unitCost = parseDecimal(data.unitCost);
    if (unitCost <= 0) throw new Error('El costo unitario debe ser mayor a 0.');
  }
  const totalCost = Math.round(quantity * unitCost * 100) / 100;

  let notes = current.notes;
  if (data.notes !== undefined) {
    notes = data.notes != null && String(data.notes).trim() !== '' ? String(data.notes).trim() : null;
  }

  await pool.execute(
    `UPDATE product_purchases SET product_id = ?, product_name = ?, quantity = ?, unit_cost = ?, total_cost = ?, purchase_date = ?, notes = ? WHERE id = ?`,
    [productId, productName, quantity, unitCost, totalCost, purchaseDate, notes, id]
  );
  return getProductPurchaseById(id);
}

export async function deleteProductPurchase(id: number): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM product_purchases WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

export async function sumProductPurchasesInRange(fromYmd: string, toYmd: string): Promise<number> {
  const rows = await query<{ total: string | number | null }[]>(
    `SELECT SUM(total_cost) AS total FROM product_purchases WHERE purchase_date >= ? AND purchase_date <= ?`,
    [fromYmd, toYmd]
  );
  return parseDecimal(rows[0]?.total ?? 0);
}
