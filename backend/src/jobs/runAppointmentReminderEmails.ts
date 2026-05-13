import { DateTime } from 'luxon';
import * as repo from '../repositories/appointments.js';
import { findUserById } from '../repositories/users.js';
import { sendAppointmentReminder1hEmail, isRealClientEmail } from '../services/email.js';

const DEFAULT_ZONE = 'America/Argentina/Buenos_Aires';

/** Minutos hasta el inicio del turno: ventana para enviar el recordatorio (~1 h antes). */
const REMINDER_MIN_MINUTES = 50;
const REMINDER_MAX_MINUTES = 75;

function shopTimeZone(): string {
  const z = (process.env.SHOP_TIMEZONE ?? '').trim();
  return z || DEFAULT_ZONE;
}

/**
 * Envía recordatorio por email ~1 h antes del turno (turnos scheduled con user_id).
 * Idempotente vía columna reminder_1h_sent. Ejecutar cada pocos minutos (p. ej. desde index.ts).
 */
export async function runAppointmentReminderEmails(): Promise<void> {
  if ((process.env.DISABLE_APPOINTMENT_REMINDER_EMAILS ?? '').trim() === '1') return;

  const zone = shopTimeZone();
  const now = DateTime.now().setZone(zone);
  if (!now.isValid) {
    console.error('[Reminder] SHOP_TIMEZONE inválido:', zone);
    return;
  }

  let ids: string[];
  try {
    ids = await repo.listScheduledAppointmentIdsForReminderScan();
  } catch (err) {
    console.error('[Reminder] Error listando turnos', err);
    return;
  }

  for (const id of ids) {
    let app;
    try {
      app = await repo.getAppointmentById(id);
    } catch {
      continue;
    }
    if (!app || app.status !== 'scheduled' || app.userId == null) continue;

    const timeNorm = (app.time ?? '').trim().slice(0, 5);
    const dateStr = (app.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeNorm)) continue;

    const start = DateTime.fromISO(`${dateStr}T${timeNorm}:00`, { zone });
    if (!start.isValid) continue;

    const diffMin = start.diff(now, 'minutes').minutes;
    if (diffMin < REMINDER_MIN_MINUTES || diffMin > REMINDER_MAX_MINUTES) continue;

    try {
      const user = await findUserById(Number(app.userId));
      if (!user || !isRealClientEmail(user.email)) {
        await repo.markAppointmentReminder1hSent(id);
        continue;
      }
      await sendAppointmentReminder1hEmail(user.email, app);
      await repo.markAppointmentReminder1hSent(id);
    } catch (err) {
      console.error(`[Reminder] Falló envío para turno ${id}`, err);
    }
  }
}
