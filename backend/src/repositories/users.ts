import { query } from '../db.js';

export interface DbUser {
  id: number;
  google_uid: string;
  email: string;
  name: string;
  role: string;
  points: number;
  barber_id: string | null;
  created_at: Date;
}

export async function findUserByGoogleUid(googleUid: string): Promise<DbUser | null> {
  const rows = await query<DbUser[]>('SELECT * FROM users WHERE google_uid = ? LIMIT 1', [googleUid]);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const rows = await query<DbUser[]>('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] ?? null;
}

export async function createUser(data: {
  google_uid: string;
  email: string;
  name: string;
  role: string;
  barberId?: string | null;
}): Promise<DbUser> {
  await query(
    'INSERT INTO users (google_uid, email, name, role, barber_id) VALUES (?, ?, ?, ?, ?)',
    [data.google_uid, data.email, data.name, data.role, data.barberId ?? null]
  );
  const user = await findUserByGoogleUid(data.google_uid);
  if (!user) throw new Error('User not created');
  return user;
}

export async function updateUserRole(id: number, role: string): Promise<void> {
  await query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
}

export async function updateUserBarberId(id: number, barberId: string | null): Promise<void> {
  await query('UPDATE users SET barber_id = ? WHERE id = ?', [barberId, id]);
}

export async function updateUserGoogleUid(id: number, googleUid: string): Promise<void> {
  await query('UPDATE users SET google_uid = ? WHERE id = ?', [googleUid, id]);
}

export async function findUserById(id: number): Promise<DbUser | null> {
  const rows = await query<DbUser[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] ?? null;
}

/** Cuentas con rol cliente (para panel admin). */
export async function findAllClients(): Promise<DbUser[]> {
  return query<DbUser[]>('SELECT * FROM users WHERE role = ? ORDER BY created_at DESC', ['client']);
}
