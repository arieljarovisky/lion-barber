import pool, { query } from '../db.js';
import { parseAppointmentProductLines, sumAppointmentProducts } from '../appointmentProducts.js';
import type { AppointmentProductLine } from '../types.js';

export type CounterSalePaymentMethod = 'cash' | 'card' | 'mercadopago';

export interface CounterSale {
  id: number;
  saleDate: string;
  buyerName: string | null;
  paymentMethod: CounterSalePaymentMethod;
  products: AppointmentProductLine[];
  totalArs: number;
  createdByUserId: number | null;
  createdByName: string | null;
  createdAt: string;
}

interface DbRow {
  id: number;
  sale_date: string | Date;
  buyer_name: string | null;
  payment_method: string;
  products: string | unknown | null;
  total_ars: string | number;
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string | Date;
}

const COLUMNS =
  'id, sale_date, buyer_name, payment_method, products, total_ars, created_by_user_id, created_by_name, created_at';

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
    paymentMethod,
    products,
    totalArs: sumAppointmentProducts(products) || Math.round(Number(row.total_ars) || 0),
    createdByUserId: row.created_by_user_id ?? null,
    createdByName: row.created_by_name?.trim() || null,
    createdAt,
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

export async function createCounterSale(data: {
  saleDate: string;
  buyerName: string | null;
  paymentMethod: CounterSalePaymentMethod;
  products: AppointmentProductLine[];
  createdByUserId: number | null;
  createdByName: string | null;
}): Promise<CounterSale> {
  const total = sumAppointmentProducts(data.products);
  const [res] = await pool.execute(
    `INSERT INTO counter_sales
      (sale_date, buyer_name, payment_method, products, total_ars, created_by_user_id, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.saleDate,
      data.buyerName,
      data.paymentMethod,
      JSON.stringify(data.products),
      total,
      data.createdByUserId,
      data.createdByName,
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
