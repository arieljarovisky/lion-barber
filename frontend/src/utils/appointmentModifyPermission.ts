import type { Appointment } from '../api';

export function canUpdateAppointmentPayments(app: Appointment): boolean {
  return (app.status ?? 'scheduled') === 'scheduled';
}

export function canModifyAppointment(
  app: Appointment,
  currentUserId: number | undefined,
  isSuperAdmin: boolean,
  closedDates: ReadonlySet<string>
): boolean {
  if (isSuperAdmin) return true;
  const dateStr = String(app.date).slice(0, 10);
  if (closedDates.has(dateStr)) return false;
  if (app.createdByUserId != null && app.createdByUserId !== currentUserId) return false;
  return true;
}

export function appointmentModifyBlockedReason(
  app: Appointment,
  currentUserId: number | undefined,
  isSuperAdmin: boolean,
  closedDates: ReadonlySet<string>
): string | null {
  if (canModifyAppointment(app, currentUserId, isSuperAdmin, closedDates)) return null;
  const dateStr = String(app.date).slice(0, 10);
  if (!isSuperAdmin && closedDates.has(dateStr)) {
    return 'Día cerrado: solo super admin puede modificar.';
  }
  if (app.createdByUserId != null && app.createdByUserId !== currentUserId) {
    return 'Turno cargado por otro usuario.';
  }
  return 'No podés modificar este turno.';
}
