import { isSuperAdminEmail } from '../auth.js';
import { isDailyCashCloseDate } from '../repositories/dailyCashClose.js';
import { staffCanEditAllAgendas, type StaffPermissionUser } from './staffPermissions.js';
import type { Appointment } from '../types.js';

export function isSuperAdminUser(user: { email: string; role: string }): boolean {
  return user.role === 'admin' && isSuperAdminEmail(user.email);
}

export async function assertCanModifyAppointment(
  user: StaffPermissionUser & { id: number; email: string; role: string },
  appointment: Appointment
): Promise<void> {
  if (isSuperAdminUser(user)) return;

  const dateStr = String(appointment.date).slice(0, 10);
  if (await isDailyCashCloseDate(dateStr)) {
    throw new Error('El día ya fue cerrado. Solo un super administrador puede modificar turnos.');
  }

  if (staffCanEditAllAgendas(user)) return;

  if (appointment.createdByUserId != null && appointment.createdByUserId !== user.id) {
    throw new Error('No podés modificar un turno cargado por otro usuario.');
  }
}
