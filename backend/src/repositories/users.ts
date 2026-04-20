import { randomUUID } from 'node:crypto';
import { query } from '../db.js';

/** Email técnico para fichas sin correo (único, válido para la columna NOT NULL). */
const PLACEHOLDER_EMAIL_HOST = 'sin-email.lion-barber.internal';

export interface DbUser {
  id: number;
  google_uid: string | null;
  email: string;
  name: string;
  role: string;
  points: number;
  barber_id: string | null;
  avatar_url: string | null;
  /** Teléfono de contacto en ficha (sincronizado con turnos). */
  phone?: string | null;
  created_at: Date;
}

export async function findUserByGoogleUid(googleUid: string): Promise<DbUser | null> {
  const rows = await query<DbUser[]>('SELECT * FROM users WHERE google_uid = ? LIMIT 1', [googleUid]);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const norm = email.trim().toLowerCase();
  const rows = await query<DbUser[]>('SELECT * FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1', [norm]);
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

/** Sincroniza nombre y foto desde el perfil de Google en cada login. */
export async function updateUserProfile(
  id: number,
  data: { name: string; avatarUrl: string | null }
): Promise<void> {
  await query('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?', [
    data.name,
    data.avatarUrl,
    id,
  ]);
}

export async function findUserById(id: number): Promise<DbUser | null> {
  const rows = await query<DbUser[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] ?? null;
}

/** Actualiza el teléfono en la ficha del cliente (solo rol client). */
export async function setClientPhone(userId: number, phone: string): Promise<void> {
  const t = phone.trim();
  await query('UPDATE users SET phone = ? WHERE id = ? AND role = ?', [
    t.length > 0 ? t : null,
    userId,
    'client',
  ]);
}

/** Cuentas con rol cliente (para panel admin). */
export async function findAllClients(): Promise<DbUser[]> {
  return query<DbUser[]>('SELECT * FROM users WHERE role = ? ORDER BY created_at DESC', ['client']);
}

/** Cliente manual (sin cuenta Google aún). `google_uid` queda NULL hasta el primer login con ese email. */
export async function createManualClient(data: {
  email?: string | null;
  name: string;
  points?: number;
  phone?: string | null;
}): Promise<DbUser> {
  const name = data.name.trim();
  if (!name) throw new Error('El nombre es obligatorio');
  let email = (data.email ?? '').trim().toLowerCase();
  if (!email) {
    email = `local-${randomUUID()}@${PLACEHOLDER_EMAIL_HOST}`;
  }
  const dup = await findUserByEmail(email);
  if (dup) throw new Error('Ya existe un usuario con ese email');
  const pts = Math.max(0, Math.min(999_999, Math.floor(data.points ?? 0)));
  const phoneRaw = (data.phone ?? '').trim();
  const phoneVal = phoneRaw.length > 0 ? phoneRaw.slice(0, 50) : null;
  await query(
    'INSERT INTO users (google_uid, email, name, role, points, phone) VALUES (NULL, ?, ?, ?, ?, ?)',
    [email, name, 'client', pts, phoneVal]
  );
  const user = await findUserByEmail(email);
  if (!user) throw new Error('No se pudo crear el cliente');
  return user;
}
