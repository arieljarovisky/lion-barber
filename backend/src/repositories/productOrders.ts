import { query } from '../db.js';
import type { ProductOrder, ProductOrderLine, ProductOrderStatus } from '../types.js';

interface DbProductOrder {
  id: number;
  user_id: number;
  status: ProductOrderStatus;
  items: string | ProductOrderLine[];
  total_ars: number | string;
  mercadopago_payment_id?: string | null;
  paid_at?: Date | string | null;
  created_at?: Date | string | null;
}

function parseItems(raw: string | ProductOrderLine[] | null | undefined): ProductOrderLine[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw) as ProductOrderLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToOrder(row: DbProductOrder): ProductOrder {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    items: parseItems(row.items),
    totalArs: Math.round(Number(row.total_ars) * 100) / 100,
    mercadopagoPaymentId: row.mercadopago_payment_id ?? undefined,
    paidAt: row.paid_at ? String(row.paid_at).replace(' ', 'T') + 'Z' : undefined,
    createdAt: row.created_at ? String(row.created_at).replace(' ', 'T') + 'Z' : undefined,
  };
}

export async function createProductOrder(data: {
  userId: number;
  items: ProductOrderLine[];
  totalArs: number;
}): Promise<ProductOrder> {
  const total = Math.round(data.totalArs * 100) / 100;
  if (!Number.isFinite(total) || total <= 0) throw new Error('Total inválido');
  if (!data.items.length) throw new Error('Pedido sin productos');
  const res = await query<{ insertId: number }>(
    `INSERT INTO product_orders (user_id, status, items, total_ars)
     VALUES (?, 'pending_payment', ?, ?)`,
    [data.userId, JSON.stringify(data.items), total]
  );
  const id = Number((res as { insertId: number }).insertId);
  const created = await getProductOrderById(id);
  if (!created) throw new Error('Pedido no creado');
  return created;
}

export async function getProductOrderById(id: number): Promise<ProductOrder | null> {
  const rows = await query<DbProductOrder[]>('SELECT * FROM product_orders WHERE id = ? LIMIT 1', [
    id,
  ]);
  const row = rows[0];
  return row ? rowToOrder(row) : null;
}

export async function getProductOrdersByUserId(userId: number): Promise<ProductOrder[]> {
  const rows = await query<DbProductOrder[]>(
    `SELECT * FROM product_orders WHERE user_id = ?
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows.map(rowToOrder);
}

export async function markProductOrderPaid(
  orderId: number,
  mercadopagoPaymentId: string
): Promise<ProductOrder | null> {
  await query(
    `UPDATE product_orders SET status = 'paid', mercadopago_payment_id = ?, paid_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending_payment'`,
    [mercadopagoPaymentId, orderId]
  );
  return getProductOrderById(orderId);
}

export async function markProductOrderCancelled(orderId: number): Promise<void> {
  await query(
    `UPDATE product_orders SET status = 'cancelled' WHERE id = ? AND status = 'pending_payment'`,
    [orderId]
  );
}

export async function getProductPaymentByMpId(
  mercadopagoPaymentId: string
): Promise<{ orderId: number; userId: number } | null> {
  const rows = await query<{ order_id: number; user_id: number }[]>(
    'SELECT order_id, user_id FROM product_payment_events WHERE mercadopago_payment_id = ? LIMIT 1',
    [mercadopagoPaymentId]
  );
  const r = rows[0];
  if (!r) return null;
  return { orderId: r.order_id, userId: r.user_id };
}

export async function recordProductPayment(data: {
  mercadopagoPaymentId: string;
  orderId: number;
  userId: number;
}): Promise<boolean> {
  try {
    await query(
      `INSERT INTO product_payment_events (mercadopago_payment_id, order_id, user_id)
       VALUES (?, ?, ?)`,
      [data.mercadopagoPaymentId, data.orderId, data.userId]
    );
    return true;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return false;
    throw e;
  }
}
