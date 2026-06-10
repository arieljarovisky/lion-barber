import type { SitePromotion } from '../api';
import { calculateDepositAmountArs } from './money';

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

/** Día ISO: 1 = lunes … 7 = domingo. */
export function isoWeekdayFromDateString(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

export function formatActiveWeekdays(days: number[]): string {
  if (!days.length) return 'Todos los días';
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? String(d))
    .join(', ');
}

export function isPromotionActiveOnDate(promo: SitePromotion, dateStr: string): boolean {
  if (!promo.active) return false;
  if (!promo.activeWeekdays?.length) return true;
  const weekday = isoWeekdayFromDateString(dateStr);
  return promo.activeWeekdays.includes(weekday);
}

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

export interface PromotionalDepositPreview {
  amountArs: number;
  promotion: SitePromotion | null;
  fullyPaidOnDeposit: boolean;
  promotionalTotalArs: number | null;
}

export function calculateBookingDepositPreview(
  servicePriceArs: number,
  depositPercent: number,
  promotions: SitePromotion[],
  dateStr: string | null | undefined
): PromotionalDepositPreview {
  const promo = dateStr ? resolveBookingPromotion(promotions, dateStr) : null;
  if (!promo?.discountPercent || promo.discountPercent <= 0) {
    return {
      amountArs: calculateDepositAmountArs(servicePriceArs, depositPercent),
      promotion: null,
      fullyPaidOnDeposit: false,
      promotionalTotalArs: null,
    };
  }
  const promotionalTotal = Math.max(
    1,
    Math.round((servicePriceArs * promo.discountPercent) / 100)
  );
  if (promo.depositCoversFull) {
    return {
      amountArs: promotionalTotal,
      promotion: promo,
      fullyPaidOnDeposit: true,
      promotionalTotalArs: promotionalTotal,
    };
  }
  return {
    amountArs: calculateDepositAmountArs(servicePriceArs, depositPercent),
    promotion: promo,
    fullyPaidOnDeposit: false,
    promotionalTotalArs: promotionalTotal,
  };
}

export function toggleWeekdayInList(days: number[], weekday: number): number[] {
  const set = new Set(days);
  if (set.has(weekday)) set.delete(weekday);
  else set.add(weekday);
  return [...set].sort((a, b) => a - b);
}
