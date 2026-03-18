import { api } from './api';
export type { Appointment } from './api';
export { api };

export async function getAppointments(params?: { date?: string; barberId?: string }) {
  return api.getAppointments(params ?? {});
}

export async function addAppointment(app: Omit<import('./api').Appointment, 'id'>) {
  return api.createAppointment(app);
}
