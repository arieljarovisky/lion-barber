import pool, { query } from '../db.js';

export type PushSubscriptionRecord = {
  id: number;
  userId: number;
  barberId: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type DbRow = {
  id: number;
  user_id: number;
  barber_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function rowToSub(r: DbRow): PushSubscriptionRecord {
  return {
    id: r.id,
    userId: r.user_id,
    barberId: r.barber_id?.trim() || null,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
  };
}

export async function upsertPushSubscription(data: {
  userId: number;
  barberId: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<PushSubscriptionRecord> {
  const endpoint = data.endpoint.trim();
  const p256dh = data.p256dh.trim();
  const auth = data.auth.trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Suscripción push incompleta');
  }
  await pool.execute(
    `INSERT INTO push_subscriptions (user_id, barber_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       barber_id = VALUES(barber_id),
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       user_agent = VALUES(user_agent)`,
    [
      data.userId,
      data.barberId?.trim() || null,
      endpoint,
      p256dh,
      auth,
      data.userAgent?.trim().slice(0, 500) || null,
    ]
  );
  const rows = await query<DbRow[]>(
    'SELECT id, user_id, barber_id, endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ? LIMIT 1',
    [endpoint]
  );
  if (!rows[0]) throw new Error('No se pudo guardar la suscripción push');
  return rowToSub(rows[0]);
}

export async function deletePushSubscriptionByEndpoint(
  userId: number,
  endpoint: string
): Promise<boolean> {
  const [res] = await pool.execute(
    'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
    [userId, endpoint.trim()]
  );
  return ((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function deletePushSubscriptionById(id: number): Promise<void> {
  await pool.execute('DELETE FROM push_subscriptions WHERE id = ?', [id]);
}

/**
 * Destinatarios de un turno nuevo:
 * - cuentas admin (p. ej. Lion Barber): siempre todos los turnos de todos los barberos
 * - cuentas staff/barbero: solo turnos de su barbero actual (users.barber_id)
 */
export async function listPushSubscriptionsForBarber(
  barberId: string
): Promise<PushSubscriptionRecord[]> {
  const bid = barberId.trim();
  if (!bid) return [];
  const rows = await query<DbRow[]>(
    `SELECT ps.id, ps.user_id, ps.barber_id, ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscriptions ps
     INNER JOIN users u ON u.id = ps.user_id
     WHERE u.role = 'admin'
        OR (
          u.role = 'staff'
          AND TRIM(COALESCE(u.barber_id, '')) <> ''
          AND TRIM(u.barber_id) = ?
        )
     ORDER BY ps.id ASC`,
    [bid]
  );
  return rows.map(rowToSub);
}
