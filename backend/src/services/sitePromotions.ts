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

export function isPromotionActiveOnDate(promo: SitePromotion, dateStr: string): boolean {
  if (!promo.active) return false;
  if (!promo.activeWeekdays.length) return true;
  const weekday = isoWeekdayFromDateString(dateStr);
  return promo.activeWeekdays.includes(weekday);
}

/** Promoción con descuento aplicable a reservas en esa fecha (mayor descuento gana). */
export function resolveBookingPromotion(
  promotions: SitePromotion[],
  dateStr: string
): SitePromotion | null {
  let best: SitePromotion | null = null;
  for (const promo of promotions) {
    if (!isPromotionActiveOnDate(promo, dateStr)) continue;
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
