import { Router } from 'express';
import { requireAuth, requireStaffOrAdmin, type AuthRequest } from '../middleware/auth.js';
import {
  deletePushSubscriptionByEndpoint,
  upsertPushSubscription,
} from '../repositories/pushSubscriptions.js';
import { getWebPushVapidPublicKey } from '../services/webPush.js';

const router = Router();

router.get('/vapid-public-key', (_req, res) => {
  const publicKey = getWebPushVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({
      error:
        'Las notificaciones push no están configuradas (faltan WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY).',
    });
  }
  res.json({ publicKey });
});

router.post('/subscribe', requireAuth, requireStaffOrAdmin, async (req: AuthRequest, res) => {
  const user = req.user!;
  const body = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    expirationTime?: number | null;
  };
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh.trim() : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth.trim() : '';
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }

  if (user.role === 'staff' && !user.barberId?.trim()) {
    return res.status(400).json({
      error: 'Tu cuenta no está vinculada a un barbero. Pedile al admin que te asigne desde Equipo.',
    });
  }

  // Admin (Lion Barber): barberId null → recibe todos los turnos.
  // Staff/barbero: solo los de su barbero vinculado.
  const barberId = user.role === 'admin' ? null : user.barberId!.trim();
  const scope = user.role === 'admin' ? 'all_barbers' : 'own_barber';

  try {
    const item = await upsertPushSubscription({
      userId: user.id,
      barberId,
      endpoint,
      p256dh,
      auth,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    res.status(201).json({
      ok: true,
      id: item.id,
      barberId: item.barberId,
      scope,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'No se pudo guardar la suscripción';
    res.status(400).json({ error: msg });
  }
});

router.delete('/subscribe', requireAuth, requireStaffOrAdmin, async (req: AuthRequest, res) => {
  const endpoint =
    typeof req.body?.endpoint === 'string'
      ? req.body.endpoint.trim()
      : typeof req.query.endpoint === 'string'
        ? req.query.endpoint.trim()
        : '';
  if (!endpoint) {
    return res.status(400).json({ error: 'Falta endpoint' });
  }
  try {
    await deletePushSubscriptionByEndpoint(req.user!.id, endpoint);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo eliminar la suscripción' });
  }
});

export default router;
