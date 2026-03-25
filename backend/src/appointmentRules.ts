import type { Appointment } from './types.js';

/** Lunes=1 … Domingo=7 (ISO). */
export function weekdayIsoFromDateString(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

export function isDateOnOpenWeekday(dateStr: string, openWeekdays: number[]): boolean {
  if (!openWeekdays.length) return true;
  const w = weekdayIsoFromDateString(dateStr);
  return openWeekdays.includes(w);
}

/** Horas hasta el inicio del turno (puede ser negativo si ya pasó). */
export function hoursUntilAppointmentStart(dateStr: string, timeStr: string): number {
  const start = new Date(`${dateStr}T${timeStr}:00`).getTime();
  return (start - Date.now()) / 3600000;
}

/** Antes de este umbral (horas hasta el turno), la seña no se reembolsa al cancelar. */
export const DEPOSIT_REFUND_MIN_HOURS = 2;

/** Reprogramar: respeta el plazo mínimo configurado en la barbería. */
export function canClientRescheduleAppointment(
  app: Appointment,
  cutoffHours: number
): { ok: boolean; reason?: string } {
  if (app.status === 'cancelled') {
    return { ok: false, reason: 'Este turno ya fue cancelado.' };
  }
  const h = hoursUntilAppointmentStart(app.date, app.time);
  if (h < 0) {
    return { ok: false, reason: 'Este turno ya pasó.' };
  }
  if (h < cutoffHours) {
    return {
      ok: false,
      reason: `No podés reprogramar con menos de ${cutoffHours} horas de anticipación.`,
    };
  }
  return { ok: true };
}

/** Cancelar: permitido hasta el inicio del turno (reembolso de seña según DEPOSIT_REFUND_MIN_HOURS en el backend). */
export function canClientCancelAppointment(app: Appointment): { ok: boolean; reason?: string } {
  if (app.status === 'cancelled') {
    return { ok: false, reason: 'Este turno ya fue cancelado.' };
  }
  const h = hoursUntilAppointmentStart(app.date, app.time);
  if (h <= 0) {
    return { ok: false, reason: 'Este turno ya pasó.' };
  }
  return { ok: true };
}
