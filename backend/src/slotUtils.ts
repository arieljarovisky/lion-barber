/** Franjas de 20 min alineadas con el calendario de reservas (10:00–20:00). */
export const TIME_SLOTS = [
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

export const BUSINESS_OPEN_MINUTES = 10 * 60;
export const BUSINESS_CLOSE_MINUTES = 20 * 60;

const OPEN_MINUTES = BUSINESS_OPEN_MINUTES;
const CLOSE_MINUTES = BUSINESS_CLOSE_MINUTES;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** El turno debe empezar dentro del horario y terminar a más tardar al cierre (17:00 + 60 min con cierre 18:00 es válido). */
export function slotFitsBusinessHours(
  startTime: string,
  durationMinutes: number,
  closeMinutes = CLOSE_MINUTES
): boolean {
  const start = timeToMinutes(startTime);
  return start >= OPEN_MINUTES && start + durationMinutes <= closeMinutes;
}

export function closeTimeToMinutes(closeTime: string | undefined): number {
  if (!closeTime) return BUSINESS_CLOSE_MINUTES;
  const n = timeToMinutes(closeTime);
  if (!Number.isFinite(n)) return BUSINESS_CLOSE_MINUTES;
  return Math.max(BUSINESS_OPEN_MINUTES + 20, Math.min(24 * 60, n));
}

export function openTimeToMinutes(openTime: string | undefined): number {
  if (!openTime) return BUSINESS_OPEN_MINUTES;
  const n = timeToMinutes(openTime);
  if (!Number.isFinite(n)) return BUSINESS_OPEN_MINUTES;
  return Math.max(0, Math.min(24 * 60 - 20, n));
}

export function intervalOverlapsExisting(
  startMin: number,
  endMin: number,
  existing: { startMin: number; endMin: number }[]
): boolean {
  for (const e of existing) {
    if (rangesOverlap(startMin, endMin, e.startMin, e.endMin)) return true;
  }
  return false;
}
