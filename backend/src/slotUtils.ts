/** Franjas de 30 min alineadas con el calendario de reservas (10:00–20:00). */
export const TIME_SLOTS = [
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30',
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

/** El turno [start, start+duration) debe quedar dentro del horario de atención. */
export function slotFitsBusinessHours(startTime: string, durationMinutes: number): boolean {
  const start = timeToMinutes(startTime);
  return start >= OPEN_MINUTES && start + durationMinutes <= CLOSE_MINUTES;
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
