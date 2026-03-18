import { query } from '../db.js';
import type { Service } from '../types.js';

interface DbService {
  id: string;
  name: string;
  price: string;
  duration: number;
  desc: string | null;
  emoji: string | null;
}

function rowToService(r: DbService): Service {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    duration: r.duration,
    desc: r.desc ?? '',
    emoji: r.emoji ?? undefined,
  };
}

export async function getAllServices(): Promise<Service[]> {
  const rows = await query<DbService[]>('SELECT * FROM services ORDER BY name');
  return rows.map(rowToService);
}

export async function getServiceById(id: string): Promise<Service | null> {
  const rows = await query<DbService[]>('SELECT * FROM services WHERE id = ? LIMIT 1', [id]);
  const r = rows[0];
  return r ? rowToService(r) : null;
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40) || 'servicio';
}

export async function createService(data: Omit<Service, 'id'>): Promise<Service> {
  let id = slugFromName(data.name);
  const existing = await getServiceById(id);
  if (existing) {
    id = `${id}_${Math.random().toString(36).slice(2, 8)}`;
  }
  await query(
    'INSERT INTO services (id, name, price, duration, `desc`, emoji) VALUES (?, ?, ?, ?, ?, ?)',
    [id, data.name, data.price, data.duration, data.desc || null, data.emoji || '']
  );
  const created = await getServiceById(id);
  if (!created) throw new Error('Servicio no creado');
  return created;
}

export async function updateService(id: string, data: Partial<Service>): Promise<Service | null> {
  const current = await getServiceById(id);
  if (!current) return null;
  const updated = { ...current, ...data };
  await query(
    'UPDATE services SET name = ?, price = ?, duration = ?, `desc` = ?, emoji = ? WHERE id = ?',
    [
      updated.name,
      updated.price,
      updated.duration,
      updated.desc || null,
      updated.emoji ?? '',
      id,
    ]
  );
  return getServiceById(id);
}

export async function deleteService(id: string): Promise<boolean> {
  const res = await query<{ affectedRows: number }>(
    'DELETE FROM services WHERE id = ?',
    [id]
  );
  return (res as { affectedRows: number }).affectedRows > 0;
}
