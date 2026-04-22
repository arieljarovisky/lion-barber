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
  /** Todos los teléfonos de contacto de la ficha. */
  phones?: string[];
  created_at: Date;
}

interface DbClientPhone {
  user_id: number;
  phone: string;
}

function normalizePhones(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const p = raw.trim().slice(0, 50);
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
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

/** Agrega un teléfono a la ficha del cliente (solo rol client). */
export async function addClientPhone(userId: number, phone: string): Promise<void> {
  const t = phone.trim().slice(0, 50);
  if (!t) return;
  await query(
    `INSERT IGNORE INTO client_phones (user_id, phone)
     SELECT id, ? FROM users WHERE id = ? AND role = ?`,
    [t, userId, 'client']
  );
  await query('UPDATE users SET phone = ? WHERE id = ? AND role = ?', [t, userId, 'client']);
}

export async function getClientPhonesByUserIds(userIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  for (const id of userIds) map.set(id, []);
  if (userIds.length === 0) return map;
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await query<DbClientPhone[]>(
    `SELECT user_id, phone
     FROM client_phones
     WHERE user_id IN (${placeholders})
     ORDER BY created_at ASC, id ASC`,
    userIds
  );
  for (const row of rows) {
    const list = map.get(row.user_id);
    if (!list) continue;
    list.push(row.phone);
  }
  return map;
}

export async function getClientPhonesByUserId(userId: number): Promise<string[]> {
  const map = await getClientPhonesByUserIds([userId]);
  return map.get(userId) ?? [];
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
  phones?: string[];
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
  const phones = normalizePhones([...(data.phones ?? []), data.phone ?? '']);
  const phoneVal = phones[0] ?? null;
  await query(
    'INSERT INTO users (google_uid, email, name, role, points, phone) VALUES (NULL, ?, ?, ?, ?, ?)',
    [email, name, 'client', pts, phoneVal]
  );
  const user = await findUserByEmail(email);
  if (!user) throw new Error('No se pudo crear el cliente');
  if (phones.length > 0) {
    for (const p of phones) {
      await addClientPhone(user.id, p);
    }
  }
  user.phones = phones;
  return user;
}
