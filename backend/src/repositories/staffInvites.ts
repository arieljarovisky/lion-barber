import pool, { query } from '../db.js';
import { dbDateTimeToIsoUtc } from '../dbDateTime.js';

export interface StaffInvite {
  id: number;
  email: string;
  name: string | null;
  /** Peluquero al que queda vinculada la cuenta al aceptar la invitación */
  barberId: string | null;
  createdAt: string;
}

interface DbInvite {
  id: number;
  email: string;
  name: string | null;
  barber_id: string | null;
  created_at: Date;
}

function row(r: DbInvite): StaffInvite {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    barberId: r.barber_id ?? null,
    createdAt: dbDateTimeToIsoUtc(r.created_at),
  };
}

export async function findInviteByEmail(email: string): Promise<StaffInvite | null> {
  const rows = await query<DbInvite[]>(
    'SELECT id, email, name, barber_id, created_at FROM staff_invites WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );
  return rows[0] ? row(rows[0]) : null;
}

export async function listInvites(): Promise<StaffInvite[]> {
  const rows = await query<DbInvite[]>(
    'SELECT id, email, name, barber_id, created_at FROM staff_invites ORDER BY created_at DESC'
  );
  return rows.map(row);
}

export async function createInvite(email: string, name: string | null, barberId: string): Promise<StaffInvite> {
  const em = email.toLowerCase().trim();
  const [res] = await pool.execute('INSERT INTO staff_invites (email, name, barber_id) VALUES (?, ?, ?)', [
    em,
    name,
    barberId,
  ]);
  const id = (res as { insertId: number }).insertId;
  const rows = await query<DbInvite[]>(
    'SELECT id, email, name, barber_id, created_at FROM staff_invites WHERE id = ?',
    [id]
  );
  const r = rows[0];
  if (!r) throw new Error('Invitación no creada');
  return row(r);
}

export async function deleteInviteByEmail(email: string): Promise<void> {
  await query('DELETE FROM staff_invites WHERE email = ?', [email.toLowerCase()]);
}

export async function deleteInviteById(id: number): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM staff_invites WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
