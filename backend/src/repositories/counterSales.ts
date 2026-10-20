import pool, { query } from '../db.js';
import { parseAppointmentProductLines, sumAppointmentProducts } from '../appointmentProducts.js';
import type { AppointmentProductLine } from '../types.js';

export type CounterSalePaymentMethod = 'cash' | 'card' | 'mercadopago';

export type CounterSaleChannel = 'counter' | 'web';

export interface CounterSale {
  id: number;
  saleDate: string;
  buyerName: string | null;
  clientUserId: number | null;
  paymentMethod: CounterSalePaymentMethod;
  products: AppointmentProductLine[];
  subscriptionPlanId: string | null;
  subscriptionPlanName: string | null;
  subscriptionGroupId: number | null;
  subscriptionAmountArs: number;
  totalArs: number;
  createdByUserId: number | null;
  createdByName: string | null;
  createdAt: string;
  /** `web`: abono pagado online. `counter`: venta cargada en el local. */
  saleChannel: CounterSaleChannel;
  mercadopagoPaymentId: string | null;
}

interface DbRow {
  id: number;
  sale_date: string | Date;
  buyer_name: string | null;
  client_user_id?: number | null;
  payment_method: string;
  products: string | unknown | null;
  total_ars: string | number;
  subscription_plan_id?: string | null;
  subscription_plan_name?: string | null;
  subscription_group_id?: number | null;
  subscription_amount_ars?: string | number | null;
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string | Date;
  sale_channel?: string | null;
  mercadopago_payment_id?: string | null;
}

const COLUMNS =
  'id, sale_date, buyer_name, client_user_id, payment_method, products, total_ars, subscription_plan_id, subscription_plan_name, subscription_group_id, subscription_amount_ars, created_by_user_id, created_by_name, created_at, sale_channel, mercadopago_payment_id';

function rowDateToYmd(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v ?? '').slice(0, 10);
}

function rowToSale(row: DbRow): CounterSale {
  const products = parseAppointmentProductLines(row.products) ?? [];
  const productTotal = sumAppointmentProducts(products);
  const subscriptionAmountArs = Math.max(0, Math.round(Number(row.subscription_amount_ars) || 0));
  const storedTotal = Math.max(0, Math.round(Number(row.total_ars) || 0));
  const createdAt =
    typeof row.created_at === 'string'
      ? row.created_at
      : row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at);
  const method = row.payment_method;
  const paymentMethod: CounterSalePaymentMethod =
    method === 'card' || method === 'mercadopago' || method === 'cash' ? method : 'cash';
  return {
    id: row.id,
    saleDate: rowDateToYmd(row.sale_date),
    buyerName: row.buyer_name?.trim() || null,
    clientUserId:
      row.client_user_id != null && Number.isFinite(Number(row.client_user_id))
        ? Number(row.client_user_id)
        : null,
    paymentMethod,
    products,
    subscriptionPlanId: row.subscription_plan_id?.trim() || null,
    subscriptionPlanName: row.subscription_plan_name?.trim() || null,
    subscriptionGroupId:
      row.subscription_group_id != null && Number.isFinite(Number(row.subscription_group_id))
        ? Number(row.subscription_group_id)
        : null,
    subscriptionAmountArs,
    totalArs: Math.max(storedTotal, productTotal + subscriptionAmountArs),
    createdByUserId: row.created_by_user_id ?? null,
    createdByName: row.created_by_name?.trim() || null,
    createdAt,
    saleChannel: row.sale_channel === 'web' ? 'web' : 'counter',
    mercadopagoPaymentId: row.mercadopago_payment_id?.trim() || null,
  };
}

export async function listCounterSalesInRange(fromYmd: string, toYmd: string): Promise<CounterSale[]> {
  const rows = await query<DbRow[]>(
    `SELECT ${COLUMNS}
     FROM counter_sales
     WHERE sale_date >= ? AND sale_date <= ?
     ORDER BY sale_date DESC, id DESC`,
    [fromYmd, toYmd]
  );
  return rows.map(rowToSale);
}

export async function getCounterSaleById(id: number): Promise<CounterSale | null> {
  const rows = await query<DbRow[]>(`SELECT ${COLUMNS} FROM counter_sales WHERE id = ?`, [id]);
  return rows[0] ? rowToSale(rows[0]) : null;
}

export async function getCounterSaleByMercadopagoPaymentId(
  mercadopagoPaymentId: string
): Promise<CounterSale | null> {
  const id = mercadopagoPaymentId.trim();
  if (!id) return null;
  const rows = await query<DbRow[]>(
    `SELECT ${COLUMNS} FROM counter_sales WHERE mercadopago_payment_id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? rowToSale(rows[0]) : null;
}

export async function createCounterSale(data: {
  saleDate: string;
  buyerName: string | null;
  clientUserId: number | null;
  paymentMethod: CounterSalePaymentMethod;
  products: AppointmentProductLine[];
  subscriptionPlanId: string | null;
  subscriptionPlanName: string | null;
  subscriptionGroupId: number | null;
  subscriptionAmountArs: number;
  createdByUserId: number | null;
  createdByName: string | null;
  saleChannel?: CounterSaleChannel;
  mercadopagoPaymentId?: string | null;
}): Promise<CounterSale> {
  const productTotal = sumAppointmentProducts(data.products);
  const subscriptionAmount = Math.max(0, Math.round(data.subscriptionAmountArs));
  const total = productTotal + subscriptionAmount;
  const [res] = await pool.execute(
    `INSERT INTO counter_sales
      (sale_date, buyer_name, client_user_id, payment_method, products, total_ars,
       subscription_plan_id, subscription_plan_name, subscription_group_id, subscription_amount_ars,
       created_by_user_id, created_by_name, sale_channel, mercadopago_payment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.saleDate,
      data.buyerName,
      data.clientUserId,
      data.paymentMethod,
      JSON.stringify(data.products),
      total,
      data.subscriptionPlanId,
      data.subscriptionPlanName,
      data.subscriptionGroupId,
      subscriptionAmount,
      data.createdByUserId,
      data.createdByName,
      data.saleChannel === 'web' ? 'web' : 'counter',
      data.mercadopagoPaymentId?.trim() || null,
    ]
  );
  const id = (res as { insertId: number }).insertId;
  const created = await getCounterSaleById(id);
  if (!created) throw new Error('No se pudo guardar la venta.');
  return created;
}

export async function deleteCounterSale(id: number): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM counter_sales WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
