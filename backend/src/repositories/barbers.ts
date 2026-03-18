import { query } from '../db.js';
import type { Barber } from '../types.js';

interface DbBarber {
  id: string;
  name: string;
  role: string;
  photo: string | null;
  desc: string | null;
}

export async function getAllBarbers(): Promise<Barber[]> {
  const rows = await query<DbBarber[]>('SELECT * FROM barbers');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    photo: r.photo ?? '',
    desc: r.desc ?? '',
  }));
}

export async function getBarberById(id: string): Promise<Barber | null> {
  const rows = await query<DbBarber[]>('SELECT * FROM barbers WHERE id = ? LIMIT 1', [id]);
  const r = rows[0];
  return r
    ? { id: r.id, name: r.name, role: r.role, photo: r.photo ?? '', desc: r.desc ?? '' }
    : null;
}
