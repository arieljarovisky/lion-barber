/** Comisión del barbero sobre el precio del servicio (liquidación). La factura AFIP es siempre por el turno completo. */
export const DEFAULT_BARBER_COMMISSION_PERCENT = 50;

/** Comisión del barbero sobre productos incluidos en la factura AFIP del turno. */
export const DEFAULT_BARBER_PRODUCT_COMMISSION_PERCENT = 10;

export function effectiveBarberCommissionPercent(stored: number | null | undefined): number {
  const n = stored != null ? Number(stored) : 0;
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_BARBER_COMMISSION_PERCENT;
}

export function barberProductCommissionAmount(productsSubtotal: number): number {
  if (productsSubtotal <= 0) return 0;
  return Math.round((productsSubtotal * DEFAULT_BARBER_PRODUCT_COMMISSION_PERCENT) / 100);
}
