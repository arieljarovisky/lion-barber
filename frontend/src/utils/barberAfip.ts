import type { Appointment, Barber } from '../api';

/** Super admin sin barberId en perfil: email → barbero (debe coincidir con backend). */
const SUPER_ADMIN_BARBER_BY_EMAIL: Record<string, string> = {
  'agustincarluccio@gmail.com': 'barber_1',
};

function inferBarberIdFromEmail(email: string, barbers: Barber[]): string | null {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (!local) return null;
  for (const b of barbers) {
    const name = b.name.toLowerCase();
    const compact = name.replace(/\s+/g, '');
    if (compact.length >= 3 && local.includes(compact)) return b.id;
    if (/agus|agustin/i.test(local) && /agus/i.test(name)) return b.id;
    if (/valen|valentin/i.test(local) && /valen/i.test(name)) return b.id;
    if (/toni|jaime/i.test(local) && /(toni|jaime)/i.test(name)) return b.id;
  }
  return null;
}

/**
 * Barbero cuyos turnos puede facturar el usuario actual.
 * `null` = sin restricción (super admin sin barbero vinculado).
 */
export function getInvoiceBarberScope(
  profile: { email: string; barberId?: string | null; isSuperAdmin?: boolean } | null | undefined,
  barbers: Barber[]
): string | null {
  if (!profile?.isSuperAdmin) return null;
  const email = profile.email.trim().toLowerCase();
  const fromUser = profile.barberId?.trim();
  if (fromUser) return fromUser;
  if (SUPER_ADMIN_BARBER_BY_EMAIL[email]) return SUPER_ADMIN_BARBER_BY_EMAIL[email];
  return inferBarberIdFromEmail(email, barbers);
}

export function appointmentMatchesInvoiceScope(
  app: Appointment,
  barbers: Barber[],
  scopeBarberId: string | null | undefined
): boolean {
  if (!scopeBarberId) return true;
  const bid = app.barberId ?? resolveBarberForAppointment(app, barbers)?.id;
  return bid === scopeBarberId;
}

export function resolveBarberForAppointment(
  app: Appointment,
  barbers: Barber[]
): Barber | undefined {
  if (app.barberId) return barbers.find((b) => b.id === app.barberId);
  const name = (app.barber ?? '').trim();
  if (!name) return undefined;
  return barbers.find((b) => b.name === name);
}

export function isBarberAfipReady(barber: Barber | undefined | null): boolean {
  return Boolean(barber?.afipCredentialsConfigured && bar.afipCuit);
}

export function canInvoiceAppointmentAfip(
  app: Appointment,
  barbers: Barber[],
  scopeBarberId?: string | null
): boolean {
  if ((app.status ?? 'scheduled') === 'cancelled') return false;
  if (app.afipCae) return false;
  if (!appointmentMatchesInvoiceScope(app, barbers, scopeBarberId)) return false;
  return isBarberAfipReady(resolveBarberForAppointment(app, barbers));
}
