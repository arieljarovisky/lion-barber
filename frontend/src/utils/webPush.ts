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

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(mq || iosStandalone);
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'error'; message?: string };

/** Pide permiso y registra este dispositivo para recibir turnos web como notificación flotante. */
export async function subscribeBarberWebPush(): Promise<PushSubscribeResult> {
  if (!isWebPushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  // En iPhone Safari, Web Push solo funciona instalada en inicio (PWA).
  if (isIosDevice() && !isStandaloneDisplay()) {
    return {
      ok: false,
      reason: 'unsupported',
      message:
        'En iPhone: tocá Compartir → Agregar a pantalla de inicio, y abrí Lion Barber desde el ícono.',
    };
  }

  try {
    const { publicKey } = await api.getPushVapidPublicKey();
    let registration: ServiceWorkerRegistration;
    try {
      const reg = await ensurePushServiceWorker();
      if (!reg) return { ok: false, reason: 'unsupported' };
      registration = await navigator.serviceWorker.ready;
    } catch (swErr) {
      const swMsg = swErr instanceof Error ? swErr.message : String(swErr);
      return {
        ok: false,
        reason: 'error',
        message: `No se pudo cargar el service worker (${swMsg}). Probá recargar.`,
      };
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    const applicationServerKey = urlBase64ToUint8Array(publicKey) as BufferSource;
    let subscription: PushSubscription;
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch {
      // Suscripción vieja con otra clave VAPID: renovar.
      const old = await registration.pushManager.getSubscription();
      await old?.unsubscribe().catch(() => undefined);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

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
