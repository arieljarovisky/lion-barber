/** Comisión del barbero sobre el precio del servicio (liquidación). La factura AFIP es siempre por el turno completo. */
export const DEFAULT_BARBER_COMMISSION_PERCENT = 50;

export function effectiveBarberCommissionPercent(stored: number | null | undefined): number {
  const n = stored != null ? Number(stored) : 0;
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_BARBER_COMMISSION_PERCENT;
}
