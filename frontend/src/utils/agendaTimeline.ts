import type { Appointment } from '../api';

export const AGENDA_TIME_SLOTS = [
  '10:00', '10:20', '10:40',
  '11:00', '11:20', '11:40',
  '12:00', '12:20', '12:40',
  '13:00', '13:20', '13:40',
  '14:00', '14:20', '14:40',
  '15:00', '15:20', '15:40',
  '16:00', '16:20', '16:40',
  '17:00', '17:20', '17:40',
  '18:00', '18:20', '18:40',
  '19:00', '19:20', '19:40',
];

/** Intervalo de la grilla (coincide con backend). */
export const SLOT_STEP_MINUTES = 20;

/** Altura visual mínima por franja de 20 min en el timeline (rem). */
export const TIMELINE_ROW_UNIT_REM = 3.75;

export type DayTimelineRow =
  | { kind: 'free'; slot: string }
  | { kind: 'blocked'; slot: string }
  | { kind: 'appointment'; slot: string; app: Appointment; span: number };

export function timeToMinutes(hhmm: string): number {
  const [hRaw, mRaw] = hhmm.split(':').map(Number);
  if (!Number.isFinite(hRaw) || !Number.isFinite(mRaw)) return NaN;
  return hRaw * 60 + mRaw;
}

export function buildTimeSlotsInRange(openTime: string, closeTime: string): string[] {
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const safeOpen = Number.isFinite(openMinutes)
    ? Math.max(0, Math.min(24 * 60 - SLOT_STEP_MINUTES, openMinutes))
    : 10 * 60;
  const safeClose = Number.isFinite(closeMinutes)
    ? Math.max(safeOpen + SLOT_STEP_MINUTES, Math.min(24 * 60, closeMinutes))
    : 20 * 60;
  return AGENDA_TIME_SLOTS.filter((slot) => {
    const start = timeToMinutes(slot);
    return Number.isFinite(start) && start >= safeOpen && start + SLOT_STEP_MINUTES < safeClose;
  });
}

/** MySQL TIME puede devolver "10:30:00"; la grilla usa "10:30". */
export function normalizeAppointmentTime(t: string | undefined): string {
  if (!t) return '';
  const s = t.trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function appointmentSlotSpan(app: Appointment): number {
  const dm = app.durationMinutes ?? 30;
  return Math.max(1, Math.ceil(dm / SLOT_STEP_MINUTES));
}

export function addMinutesToClock(hhmm: string, minutes: number): string {
  const parts = hhmm.trim().slice(0, 5).split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  let total = h * 60 + m + minutes;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const H = Math.floor(total / 60);
  const M = total % 60;
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

/** Una fila por bloque libre, bloqueado o turno que ocupa N franjas de 20 min. */
export function buildDayTimelineRows(
  apps: Appointment[],
  slots: string[],
  blockedSlots?: Set<string>
): DayTimelineRow[] {
  const byStart = new Map<string, Appointment>();
  for (const a of apps) {
    const k = normalizeAppointmentTime(a.time);
    if (k) byStart.set(k, a);
  }
  const rows: DayTimelineRow[] = [];
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    const app = byStart.get(slot);
    if (app) {
      const rawSpan = appointmentSlotSpan(app);
      const span = Math.min(rawSpan, slots.length - i);
      rows.push({ kind: 'appointment', slot, app, span });
      i += span;
    } else if (blockedSlots?.has(slot)) {
      rows.push({ kind: 'blocked', slot });
      i += 1;
    } else {
      rows.push({ kind: 'free', slot });
      i += 1;
    }
  }
  return rows;
}
