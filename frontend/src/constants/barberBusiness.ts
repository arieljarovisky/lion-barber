/** Comisión del barbero sobre el precio del servicio (liquidación / cierre de caja). */
export const BARBER_COMMISSION_PERCENT = 50;

/**
 * El abono incluye 6 cortes y se paga como 5.
 * La comisión de cada corte usa 5/6 del valor del servicio (ej. $24.000 → $20.000, y al 50% son $10.000).
 */
export const SUBSCRIPTION_COMMISSION_PAID_CUTS = 5;
export const SUBSCRIPTION_INCLUDED_CUTS = 6;

/** Comisión del barbero sobre productos cargados en el turno. */
export const BARBER_PRODUCT_COMMISSION_PERCENT = 10;

/** El canje de Agustín no genera comisión. El de los demás barberos sí, al porcentaje del servicio. */
export function barberCanjeSkipsCommission(name: string | null | undefined): boolean {
  const token = (name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)[0];
  return token === 'agus' || token === 'agustin';
}
