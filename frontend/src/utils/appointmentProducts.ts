import type { AppointmentProductLine, ShopProduct } from '../api';
import { parseArsAmount } from './money';

export const MAX_APPOINTMENT_PRODUCT_LINES = 20;

/** Suma de subtotales (ARS, entero). */
export function sumAppointmentProducts(
  lines: AppointmentProductLine[] | null | undefined
): number {
  if (!lines?.length) return 0;
  return lines.reduce((acc, l) => acc + (l.subtotal > 0 ? l.subtotal : 0), 0);
}

/** ¿Hay productos cargados? (incluye legacy con cantidad 0 → false) */
export function hasAppointmentProducts(
  lines: AppointmentProductLine[] | null | undefined
): boolean {
  return !!lines && lines.some((l) => l.quantity > 0);
}

/** Texto corto: ej. "2 productos · $5.000". */
export function formatAppointmentProductsSummary(
  lines: AppointmentProductLine[] | null | undefined
): string | null {
  if (!hasAppointmentProducts(lines)) return null;
  const total = sumAppointmentProducts(lines);
  const items = (lines ?? []).reduce((acc, l) => acc + l.quantity, 0);
  return `${items} producto${items === 1 ? '' : 's'} · $${total.toLocaleString('es-AR')}`;
}

/** Devuelve productos con precio cargado (los únicos cargables en un turno). */
export function pricedShopProducts(shopProducts: ShopProduct[]): ShopProduct[] {
  return shopProducts.filter((p) => {
    if (!p.unitPrice) return false;
    const n = parseArsAmount(String(p.unitPrice));
    return n != null && n > 0;
  });
}

/** Construye una línea a partir del catálogo (snapshot de nombre y precio). */
export function buildProductLine(
  product: ShopProduct,
  quantity: number
): AppointmentProductLine | null {
  const q = Math.floor(quantity);
  if (!Number.isFinite(q) || q <= 0) return null;
  const unit = parseArsAmount(String(product.unitPrice ?? ''));
  if (unit == null || unit <= 0) return null;
  const unitPrice = Math.round(unit);
  return {
    productId: product.id,
    name: product.name,
    quantity: q,
    unitPrice,
    subtotal: unitPrice * q,
  };
}
