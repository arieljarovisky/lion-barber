import { api } from '../api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  return navigator.serviceWorker.register('/sw.js');
}

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'error'; message?: string };

/** Pide permiso y registra este dispositivo para recibir turnos web como notificación flotante. */
export async function subscribeBarberWebPush(): Promise<PushSubscribeResult> {
  if (!isWebPushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const { publicKey } = await api.getPushVapidPublicKey();
    const registration = await ensurePushServiceWorker();
    if (!registration) return { ok: false, reason: 'unsupported' };

    await navigator.serviceWorker.ready;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'error', message: 'Suscripción incompleta' };
    }

    await api.subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'No se pudieron activar las notificaciones';
    if (/503|no están configuradas|VAPID/i.test(message)) {
      return { ok: false, reason: 'unavailable', message };
    }
    return { ok: false, reason: 'error', message };
  }
}

export async function getCurrentPushSubscriptionEndpoint(): Promise<string | null> {
  if (!isWebPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = await registration?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}
