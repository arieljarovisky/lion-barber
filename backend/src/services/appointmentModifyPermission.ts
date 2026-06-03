import { isSuperAdminEmail } from '../auth.js';
import { isDailyCashCloseDate } from '../repositories/dailyCashClose.js';
import type { Appointment } from '../types.js';

export function isSuperAdminUser(user: { email: string; role: string }): boolean {
  return user.role === 'admin' && isSuperAdminEmail(user.email);
}

export async function assertCanModifyAppointment(
  user: { id: number; email: string; role: string },
  appointment: Appointment
): Promise<void> {
  if (isSuperAdminUser(user)) return;

  const dateStr = String(appointment.date).slice(0, 10);
  if (await isDailyCashCloseDate(dateStr)) {
    throw new Error('El día ya fue cerrado. Solo un super administrador puede modificar turnos.');
  }

  if (appointment.createdByUserId != null && appointment.createdByUserId !== user.id) {
    throw new Error('No podés modificar un turno cargado por otro usuario.');
  }
}
