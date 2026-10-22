import webpush from 'web-push';
import type { Appointment } from '../types.js';
import {
  deletePushSubscriptionById,
  listPushSubscriptionsForBarber,
  type PushSubscriptionRecord,
} from '../repositories/pushSubscriptions.js';

export type WebPushVapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

let vapidConfigured = false;

export function getWebPushVapidPublicKey(): string | null {
  const publicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? '').trim();
  return publicKey || null;
}

function getVapidConfig(): WebPushVapidConfig | null {
  const publicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? '').trim();
  if (!publicKey || !privateKey) return null;
  let subject = (process.env.WEB_PUSH_VAPID_SUBJECT ?? '').trim();
  if (!subject) {
    try {
      const host = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).hostname : '';
      subject = host ? `mailto:push@${host}` : 'mailto:push@lionbarber.local';
    } catch {
      subject = 'mailto:push@lionbarber.local';
    }
  }
  return { publicKey, privateKey, subject };
}

function ensureVapid(): WebPushVapidConfig | null {
  const cfg = getVapidConfig();
  if (!cfg) return null;
  if (!vapidConfigured) {
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    vapidConfigured = true;
  }
  return cfg;
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function buildWebAppointmentPushPayload(app: Appointment): {
  title: string;
  body: string;
  url: string;
  tag: string;
} {
  const depositHint = app.depositPaid ? 'Seña pagada' : 'Sin seña';
  const barberLabel = (app.barber ?? app.barberId ?? '').trim();
  const barberPart = barberLabel ? ` · ${barberLabel}` : '';
  const fromWeb = app.createdByUserId == null;
  return {
    title: fromWeb ? 'Nuevo turno desde la web' : 'Nuevo turno agendado',
    body: `${app.name} · ${app.service}${barberPart} · ${fmtDate(app.date)} ${app.time} · ${depositHint}`,
    url: '/dashboard',
    tag: `appointment-${app.id}`,
  };
}

async function sendToSubscription(
  sub: PushSubscriptionRecord,
  payload: string
): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payload,
      { TTL: 60 * 60 * 12, urgency: 'high' }
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    // 404/410: suscripción muerta (desinstaló / revocó permiso)
    if (statusCode === 404 || statusCode === 410) {
      await deletePushSubscriptionById(sub.id).catch(() => undefined);
      return;
    }
    console.error(`[WebPush] Error enviando a sub ${sub.id}:`, err);
  }
}

/**
 * Push nativo: el barbero asignado recibe solo su turno;
 * las cuentas admin (Lion Barber) reciben todos los turnos de todos los barberos.
 */
export async function notifyBarberPushOnNewWebAppointment(app: Appointment): Promise<void> {
  if (!ensureVapid()) return;
  const barberId = app.barberId?.trim();
  if (!barberId) return;

  const subs = await listPushSubscriptionsForBarber(barberId);
  if (subs.length === 0) {
    console.warn(
      `[WebPush] Sin dispositivos suscriptos para barbero ${barberId} (turno ${app.id})`
    );
    return;
  }

  const payload = JSON.stringify(buildWebAppointmentPushPayload(app));
  await Promise.all(subs.map((sub) => sendToSubscription(sub, payload)));
}
