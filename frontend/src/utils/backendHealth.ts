const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '');

const HEALTH_CHECK_TIMEOUT_MS = 8_000;

/** Enlace de WhatsApp cuando la reserva online no está disponible (mismo que el footer por defecto). */
export const BOOKING_FALLBACK_WHATSAPP_URL =
  (import.meta.env.VITE_BOOKING_WHATSAPP_URL as string | undefined)?.trim() ||
  'https://wa.link/xxyvs9';

/** True si el backend responde GET /api/health con { ok: true }. */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const res = await fetch(`${API_URL}/api/health`, { signal: ctrl.signal, cache: 'no-store' });
    window.clearTimeout(timer);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}
