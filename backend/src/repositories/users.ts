import { randomUUID } from 'node:crypto';
import pool, { query } from '../db.js';

/** Email técnico para fichas sin correo (único, válido para la columna NOT NULL). */
export const PLACEHOLDER_EMAIL_HOST = 'sin-email.lion-barber.internal';

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

function normalizePersonName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/** Evita matchear solo "Juan" o nombres demasiado cortos. */
function looksLikeDistinctiveFullName(name: string): boolean {
  const t = normalizePersonName(name);
  return t.length >= 8 && t.includes(' ');
}

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
  /** Si es true, el cliente queda exento de pagar seña: sus turnos se confirman directo. */
  deposit_exempt?: number | boolean | null;
  /** Notas internas del panel (recordatorios para el equipo). */
  admin_notes?: string | null;
  subscription_plan_id?: string | null;
  subscription_period_start?: string | Date | null;
  subscription_cuts_used?: number;
  subscription_group_id?: number | null;
  /** Saldo cuenta corriente en ARS. Negativo = el cliente debe plata. */
  account_balance_ars?: number | string | null;
  /** Staff: puede ver agendas de todos los barberos. */
  perm_view_all_agendas?: number | boolean | null;
  /** Staff: puede crear/editar/eliminar turnos de cualquier barbero. */
  perm_edit_all_agendas?: number | boolean | null;
  created_at: Date;
}

export type UpdateAdminClientInput = {
  name?: string;
  email?: string;
  phones?: string[];
  points?: number;
  depositExempt?: boolean;
  adminNotes?: string | null;
  accountBalanceArs?: number;
};

export function isUserDepositExempt(u: Pick<DbUser, 'deposit_exempt'>): boolean {
  const v = u.deposit_exempt;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  return false;
}

/** Actualiza el flag de exención (solo clientes). */
export async function setClientDepositExempt(userId: number, exempt: boolean): Promise<DbUser | null> {
  await query('UPDATE users SET deposit_exempt = ? WHERE id = ? AND role = ?', [
    exempt ? 1 : 0,
    userId,
    'client',
  ]);
  return findUserById(userId);
}

export async function replaceClientPhones(userId: number, phones: string[]): Promise<void> {
  const normalized = normalizePhones(phones);
  await query('DELETE FROM client_phones WHERE user_id = ?', [userId]);
  for (const p of normalized) {
    await query('INSERT INTO client_phones (user_id, phone) VALUES (?, ?)', [userId, p]);
  }
  await query('UPDATE users SET phone = ? WHERE id = ? AND role = ?', [
    normalized[0] ?? null,
    userId,
    'client',
  ]);
}

function normalizeAdminNotes(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  return t.slice(0, 8000);
}

function normalizeAccountBalanceArs(raw: number): number {
  if (!Number.isFinite(raw)) throw new Error('El saldo debe ser un número válido');
  if (raw < -999_999_999.99 || raw > 999_999_999.99) {
    throw new Error('El saldo está fuera del rango permitido');
  }
  return Math.round(raw * 100) / 100;
}

export function parseDbAccountBalanceArs(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return normalizeAccountBalanceArs(n);
}

/** Actualiza ficha de cliente (panel admin). */
export async function updateAdminClientById(
  userId: number,
  input: UpdateAdminClientInput
): Promise<DbUser | null> {
  const existing = await findUserById(userId);
  if (!existing || existing.role !== 'client') return null;

  if (input.name != null) {
    const name = input.name.trim();
    if (!name) throw new Error('El nombre no puede estar vacío');
    await query('UPDATE users SET name = ? WHERE id = ? AND role = ?', [name, userId, 'client']);
  }

  if (input.email != null && !existing.google_uid) {
    let email = input.email.trim().toLowerCase();
    if (!email) {
      email = `local-${randomUUID()}@${PLACEHOLDER_EMAIL_HOST}`;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Email inválido');
    }
    const dup = await findUserByEmail(email);
    if (dup && dup.id !== userId) throw new Error('Ya existe un usuario con ese email');
    await query('UPDATE users SET email = ? WHERE id = ? AND role = ?', [email, userId, 'client']);
  }

  if (input.points != null) {
    const n = Number(input.points);
    if (!Number.isFinite(n) || n < 0) throw new Error('Los puntos deben ser un número ≥ 0');
    const pts = Math.min(999_999, Math.floor(n));
    await query('UPDATE users SET points = ? WHERE id = ? AND role = ?', [pts, userId, 'client']);
  }

  if (input.depositExempt != null) {
    const subRows = await query<{ subscription_group_id: number | null; subscription_plan_id: string | null }[]>(
      'SELECT subscription_group_id, subscription_plan_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const hasSub =
      Boolean(subRows[0]?.subscription_group_id) ||
      Boolean(subRows[0]?.subscription_plan_id?.trim());
    if (!hasSub) {
      await query('UPDATE users SET deposit_exempt = ? WHERE id = ? AND role = ?', [
        input.depositExempt ? 1 : 0,
        userId,
        'client',
      ]);
    }
  }

  if (input.adminNotes !== undefined) {
    await query('UPDATE users SET admin_notes = ? WHERE id = ? AND role = ?', [
      normalizeAdminNotes(input.adminNotes),
      userId,
      'client',
    ]);
  }

  if (input.accountBalanceArs !== undefined) {
    const balance = normalizeAccountBalanceArs(Number(input.accountBalanceArs));
    await query('UPDATE users SET account_balance_ars = ? WHERE id = ? AND role = ?', [
      balance,
      userId,
      'client',
    ]);
  }

  if (input.phones != null) {
    await replaceClientPhones(userId, input.phones);
  }

  return findUserById(userId);
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

/**
 * Clientes manuales sin Google aún, cuyo teléfono en ficha coincide (solo dígitos).
 * Si hay más de uno no se fusiona automáticamente.
 */
export async function findUnlinkedManualClientIdsByPhoneDigits(digits: string): Promise<number[]> {
  const d = normalizePhoneDigits(digits);
  if (d.length < 8) return [];
  const rows = await query<DbUser[]>(
    "SELECT * FROM users WHERE role = 'client' AND google_uid IS NULL"
  );
  const ids: number[] = [];
  const phoneMap = await getClientPhonesByUserIds(rows.map((r) => r.id));
  for (const u of rows) {
    const listed = phoneMap.get(u.id) ?? [];
    const fromUser = u.phone ? [u.phone] : [];
    let hit = false;
    for (const p of [...listed, ...fromUser]) {
      if (normalizePhoneDigits(p) === d) {
        hit = true;
        break;
      }
    }
    if (hit) ids.push(u.id);
  }
  return ids;
}

/**
 * Un solo cliente manual con email placeholder y nombre normalizado igual al de Google
 * (nombre y apellido, sin tildes, para bajar falsos positivos).
 */
export async function findUnlinkedManualClientIdByExactNameForAutoLink(googleName: string): Promise<number | null> {
  if (!looksLikeDistinctiveFullName(googleName)) return null;
  const target = normalizePersonName(googleName);
  const rows = await query<DbUser[]>(
    `SELECT id, email, name FROM users WHERE role = 'client' AND google_uid IS NULL AND LOWER(email) LIKE ?`,
    [`%@${PLACEHOLDER_EMAIL_HOST}`]
  );
  const hits = rows.filter((r) => normalizePersonName(r.name) === target);
  if (hits.length !== 1) return null;
  return hits[0].id;
}

/** Vincula la cuenta Google a una ficha manual existente (mismo id, puntos e historial). */
export async function linkGoogleIdentityToClient(
  clientId: number,
  data: { googleUid: string; email: string; name: string; avatarUrl: string | null }
): Promise<DbUser | null> {
  const uidDup = await findUserByGoogleUid(data.googleUid);
  if (uidDup && uidDup.id !== clientId) return null;
  const emailNorm = data.email.trim().toLowerCase();
  const mailDup = await findUserByEmail(data.email);
  if (mailDup && mailDup.id !== clientId) return null;
  const [res] = await pool.execute(
    `UPDATE users SET google_uid = ?, email = ?, name = ?, avatar_url = ?
     WHERE id = ? AND role = 'client' AND google_uid IS NULL`,
    [data.googleUid, emailNorm, data.name.trim(), data.avatarUrl, clientId]
  );
  const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (!affected) return null;
  return findUserById(clientId);
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

/** Suma puntos de fidelidad a un cliente (p. ej. compra web de productos). */
export async function incrementClientPoints(userId: number, delta: number): Promise<void> {
  const add = Math.floor(Number(delta));
  if (!Number.isFinite(add) || add <= 0) return;
  await query(
    'UPDATE users SET points = LEAST(999999, points + ?) WHERE id = ? AND role = ?',
    [add, userId, 'client']
  );
}

/** Empleados activos (panel super admin). */
export async function listStaffUsers(): Promise<DbUser[]> {
  return query<DbUser[]>(
    "SELECT * FROM users WHERE role = 'staff' ORDER BY name ASC, created_at ASC"
  );
}

export async function updateStaffPermissions(
  userId: number,
  perms: { viewAllAgendas: boolean; editAllAgendas: boolean }
): Promise<DbUser | null> {
  const viewAll = perms.editAllAgendas ? true : perms.viewAllAgendas;
  await query(
    `UPDATE users SET perm_view_all_agendas = ?, perm_edit_all_agendas = ?
     WHERE id = ? AND role = 'staff'`,
    [viewAll ? 1 : 0, perms.editAllAgendas ? 1 : 0, userId]
  );
  return findUserById(userId);
}

/** Elimina un cliente y desvincula sus turnos (mantiene historial en agenda). */
export async function deleteClientById(userId: number): Promise<boolean> {
  const existing = await findUserById(userId);
  if (!existing || existing.role !== 'client') return false;
  await query('UPDATE appointments SET user_id = NULL WHERE user_id = ?', [userId]);
  await query('DELETE FROM client_phones WHERE user_id = ?', [userId]);
  const [res] = await pool.execute('DELETE FROM users WHERE id = ? AND role = ?', [userId, 'client']);
  return (res as { affectedRows: number }).affectedRows > 0;
}
