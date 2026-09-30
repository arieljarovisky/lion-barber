import { calculateDepositAmountArs } from '../depositAmount.js';
import type { SitePromotion } from '../repositories/promotions.js';
import { isoWeekdayFromDateString } from '../weekdayUtils.js';

export function parseActiveWeekdays(raw: string | null | undefined): number[] {
  if (!raw || !String(raw).trim()) return [];
  const parts = String(raw)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
  return [...new Set(parts)].sort((a, b) => a - b);
}

export function serializeActiveWeekdays(days: number[] | null | undefined): string | null {
  if (!days?.length) return null;
  const uniq = [...new Set(days.filter((n) => n >= 1 && n <= 7))].sort((a, b) => a - b);
  return uniq.length > 0 ? uniq.join(',') : null;
}

export function parseServiceIds(raw: string | null | undefined): string[] {
  if (!raw || !String(raw).trim()) return [];
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

export function serializeServiceIds(ids: string[] | null | undefined): string | null {
  if (!ids?.length) return null;
  const uniq = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  return uniq.length > 0 ? uniq.join(',') : null;
}

/** Lista vacía = la promo aplica a todos los servicios. */
export function promotionAppliesToService(
  promo: { serviceIds?: string[] },
  serviceId: string | null | undefined
): boolean {
  const ids = promo.serviceIds ?? [];
  if (!ids.length) return true;
  if (!serviceId) return false;
  return ids.includes(serviceId);
}

export function isPromotionActiveOnDate(promo: SitePromotion, dateStr: string): boolean {
  if (!promo.active) return false;
  if (!promo.activeWeekdays.length) return true;
  const weekday = isoWeekdayFromDateString(dateStr);
  return promo.activeWeekdays.some((day) => Number(day) === weekday);
}

/** Promoción con descuento aplicable a reservas en esa fecha y servicio (mayor descuento gana). */
export function resolveBookingPromotion(
  promotions: SitePromotion[],
  dateStr: string,
  serviceId?: string | null
): SitePromotion | null {
  let best: SitePromotion | null = null;
  for (const promo of promotions) {
    if (!isPromotionActiveOnDate(promo, dateStr)) continue;
    if (!promotionAppliesToService(promo, serviceId)) continue;
    const pct = promo.discountPercent;
    if (pct == null || pct <= 0 || pct > 100) continue;
    if (!best || pct < (best.discountPercent ?? 101)) {
      best = promo;
    }
  }
  return best;
}

export interface PromotionalDepositResult {
  amountArs: number;
  promotionId: string | null;
  promotionFullyPaid: boolean;
  promotionalTotalArs: number | null;
}

export function calculateBookingDepositArs(
  servicePriceArs: number,
  depositPercent: number,
  promo: SitePromotion | null
): PromotionalDepositResult {
  if (!promo?.discountPercent || promo.discountPercent <= 0) {
    return {
      amountArs: calculateDepositAmountArs(servicePriceArs, depositPercent),
      promotionId: null,
      promotionFullyPaid: false,
      promotionalTotalArs: null,
    };
  }
  const promotionalTotal = Math.max(1, Math.round((servicePriceArs * promo.discountPercent) / 100));
  if (promo.depositCoversFull) {
    return {
      amountArs: promotionalTotal,
      promotionId: promo.id,
      promotionFullyPaid: true,
      promotionalTotalArs: promotionalTotal,
    };
  }
  return {
    amountArs: calculateDepositAmountArs(servicePriceArs, depositPercent),
    promotionId: promo.id,
    promotionFullyPaid: false,
    promotionalTotalArs: promotionalTotal,
  };
}
