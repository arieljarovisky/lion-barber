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

/** HH:mm o HH:mm:ss → HH:mm (MySQL TIME suele devolver segundos). */
export function normalizeTimeSlot(timeStr: string): string {
  const t = timeStr.trim();
  if (t.length >= 5) return t.slice(0, 5);
  return t;
}

/** Fecha calendario (yyyy-MM-dd) en Argentina; comparación segura con strings ISO. */
export function todayYmdArgentina(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) return new Date().toISOString().slice(0, 10);
  return `${y}-${m}-${d}`;
}

export function isPastCalendarDateInArgentina(dateStr: string): boolean {
  const clean = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return true;
  return clean < todayYmdArgentina();
}

/** Horas hasta el inicio del turno (puede ser negativo si ya pasó). */
export function hoursUntilAppointmentStart(dateStr: string, timeStr: string): number {
  const t = normalizeTimeSlot(timeStr);
  // Negocio en Argentina: evitar interpretar la hora en UTC del servidor (Railway).
  const start = Date.parse(`${dateStr}T${t}:00-03:00`);
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
