import { expireStalePendingAppointments } from '../repositories/appointments.js';

/** Cancela turnos pending_payment cuya seña no se pagó antes de payment_due_at. */
export async function runExpirePendingPayments(): Promise<void> {
  await expireStalePendingAppointments();
}
