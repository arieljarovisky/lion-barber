import { mysqlDatetimeUtcNaiveFromDate } from './mysqlUtcDatetime.js';

/** Plazo para abonar la seña desde que se reserva el horario (minutos). */
export function getPendingPaymentMinutes(): number {
  const raw = parseInt(process.env.PENDING_PAYMENT_MINUTES ?? '10', 10);
  if (!Number.isFinite(raw) || raw < 1) return 10;
  return Math.min(120, raw);
}

/** DATETIME UTC naive en MySQL (misma convención que afip_facturado_at). */
export function paymentDueAtFromNow(minutes = getPendingPaymentMinutes()): string {
  return mysqlDatetimeUtcNaiveFromDate(new Date(Date.now() + minutes * 60 * 1000));
}
