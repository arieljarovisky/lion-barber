import pool, { query } from '../db.js';
import type { Service } from '../types.js';

interface DbService {
  id: string;
  name: string;
  price: string;
  duration: number;
  desc: string | null;
  emoji: string | null;
  sort_order: number;
}

function rowToService(r: DbService): Service {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    duration: r.duration,
    desc: r.desc ?? '',
    emoji: r.emoji ?? undefined,
    sortOrder: r.sort_order,
  };
}

export async function getAllServices(): Promise<Service[]> {
  const rows = await query<DbService[]>('SELECT * FROM services ORDER BY sort_order ASC, name ASC');
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
  const maxRows = await query<{ maxOrder: number | null }[]>(
    'SELECT MAX(sort_order) AS maxOrder FROM services'
  );
  const nextOrder = Number(maxRows[0]?.maxOrder ?? 0) + 1;
  await query(
    'INSERT INTO services (id, name, price, duration, `desc`, emoji, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, data.name, data.price, data.duration, data.desc || null, data.emoji || '', nextOrder]
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

export async function reorderServices(idsInOrder: string[]): Promise<Service[]> {
  const ids = idsInOrder.map((x) => x.trim()).filter(Boolean);
  if (ids.length === 0) return getAllServices();

  const rows = await query<{ id: string }[]>('SELECT id FROM services ORDER BY sort_order ASC, name ASC');
  const currentIds = rows.map((r) => r.id);
  if (currentIds.length !== ids.length) {
    throw new Error('La lista de servicios no coincide con la cantidad actual.');
  }
  const currentSet = new Set(currentIds);
  if (ids.some((id) => !currentSet.has(id))) {
    throw new Error('La lista de servicios contiene IDs inválidos.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let sortOrder = 1;
    for (const id of ids) {
      await conn.execute('UPDATE services SET sort_order = ? WHERE id = ?', [sortOrder, id]);
      sortOrder += 1;
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getAllServices();
}
