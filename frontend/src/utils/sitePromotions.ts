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

/** Lista vacía = la promo aplica a todos los servicios. */
export function promotionAppliesToService(
  promo: Pick<SitePromotion, 'serviceIds'>,
  serviceId: string | null | undefined
): boolean {
  const ids = promo.serviceIds ?? [];
  if (!ids.length) return true;
  if (!serviceId) return false;
  return ids.includes(serviceId);
}

export function formatPromotionServices(
  serviceIds: string[] | undefined,
  services: { id: string; name: string }[]
): string {
  if (!serviceIds?.length) return 'Todos los servicios';
  const names = serviceIds.map((id) => services.find((s) => s.id === id)?.name ?? id);
  return names.join(', ');
}

export function toggleIdInList(ids: string[], id: string): string[] {
  const set = new Set(ids);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set];
}

export function isPromotionActiveOnDate(promo: SitePromotion, dateStr: string): boolean {
  if (!promo.active) return false;
  if (!promo.activeWeekdays?.length) return true;
  const weekday = isoWeekdayFromDateString(dateStr);
  return promo.activeWeekdays.some((day) => Number(day) === weekday);
}

/** Promos del servicio que no corren en esa fecha: se puede reservar igual, a precio normal. */
export function promotionsOutsideSelectedDate(
  promotions: SitePromotion[],
  dateStr: string,
  serviceId: string | null | undefined
): SitePromotion[] {
  if (!serviceId || !dateStr) return [];
  return promotions.filter((promo) => {
    if (!promo.active || !promo.discountPercent || promo.discountPercent <= 0) return false;
    if (!promotionAppliesToService(promo, serviceId)) return false;
    if (!promo.activeWeekdays?.length) return false;
    return !isPromotionActiveOnDate(promo, dateStr);
  });
}

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
  dateStr: string | null | undefined,
  serviceId?: string | null
): PromotionalDepositPreview {
  const promo = dateStr ? resolveBookingPromotion(promotions, dateStr, serviceId) : null;
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
