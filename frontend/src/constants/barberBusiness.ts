/** Comisión del barbero sobre el precio del servicio (liquidación / cierre de caja). */
export const BARBER_COMMISSION_PERCENT = 50;

/**
 * Respaldo para turnos de abono viejos, sin precio del plan guardado.
 * Esos cortes se liquidan como 5 de 6 del valor del servicio.
 */
export const SUBSCRIPTION_COMMISSION_PAID_CUTS = 5;
export const SUBSCRIPTION_INCLUDED_CUTS = 6;

/** Costo de un corte del abono: precio del plan dividido por la cantidad de cortes. */
export function subscriptionCutCostArs(
  planPriceArs: number | null | undefined,
  cuts: number | null | undefined
): number | null {
  if (planPriceArs == null || cuts == null) return null;
  if (!Number.isFinite(planPriceArs) || !Number.isFinite(cuts)) return null;
  if (planPriceArs <= 0 || cuts <= 0) return null;
  return Math.round(planPriceArs / cuts);
}

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
