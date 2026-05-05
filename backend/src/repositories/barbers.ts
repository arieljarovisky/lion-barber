import pool, { query } from '../db.js';
import type { Barber } from '../types.js';

interface DbBarber {
  id: string;
  name: string;
  role: string;
  photo: string | null;
  desc: string | null;
  whatsapp_phone?: string | null;
  commission_percent?: string | number | null;
}

function rowToBarber(r: DbBarber): Barber {
  const pct = r.commission_percent != null ? Number(r.commission_percent) : 0;
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    photo: r.photo ?? '',
    desc: r.desc ?? '',
    whatsappPhone: r.whatsapp_phone ?? null,
    commissionPercent: Number.isFinite(pct) ? pct : 0,
  };
}

export async function getAllBarbers(): Promise<Barber[]> {
  const rows = await query<DbBarber[]>('SELECT * FROM barbers');
  return rows.map(rowToBarber);
}

export async function getBarberById(id: string): Promise<Barber | null> {
  const rows = await query<DbBarber[]>('SELECT * FROM barbers WHERE id = ? LIMIT 1', [id]);
  const r = rows[0];
  return r ? rowToBarber(r) : null;
}

export async function updateBarberCommission(id: string, commissionPercent: number): Promise<Barber | null> {
  const p = Math.min(100, Math.max(0, commissionPercent));
  await pool.execute('UPDATE barbers SET commission_percent = ? WHERE id = ?', [p, id]);
  return getBarberById(id);
}

export async function updateBarber(
  id: string,
  data: { name?: string; commissionPercent?: number; whatsappPhone?: string | null }
): Promise<Barber | null> {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (data.name != null) {
    const n = data.name.trim();
    if (!n) throw new Error('El nombre no puede quedar vacío.');
    fields.push('name = ?');
    values.push(n);
  }

  if (data.commissionPercent != null) {
    const p = Math.min(100, Math.max(0, Number(data.commissionPercent)));
    if (!Number.isFinite(p)) throw new Error('Comisión inválida.');
    fields.push('commission_percent = ?');
    values.push(p);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'whatsappPhone')) {
    const w = data.whatsappPhone == null ? '' : String(data.whatsappPhone).trim();
    if (w && !/^\+[1-9]\d{7,14}$/.test(w)) {
      throw new Error('WhatsApp inválido. Usá formato internacional, por ejemplo +54911...');
    }
    fields.push('whatsapp_phone = ?');
    values.push(w || null);
  }

  if (!fields.length) return getBarberById(id);

  await pool.execute(`UPDATE barbers SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
  return getBarberById(id);
}
