import type { Appointment, Barber } from '../api';

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

export function canInvoiceAppointmentAfip(app: Appointment, barbers: Barber[]): boolean {
  if ((app.status ?? 'scheduled') === 'cancelled') return false;
  if (app.afipCae) return false;
  return isBarberAfipReady(resolveBarberForAppointment(app, barbers));
}
