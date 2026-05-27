import type { AppointmentProductLine } from './types.js';

export const MAX_APPOINTMENT_PRODUCT_LINES = 20;

/**
 * Parsea las líneas de producto guardadas en `appointments.products` (JSON).
 * Tolera datos viejos / mal formados: descarta lo inválido y deja el resto.
 * Devuelve `null` si no hay nada usable (útil para no guardar `[]` ruidosos).
 */
export function parseAppointmentProductLines(raw: unknown): AppointmentProductLine[] | null {
  if (raw == null || raw === '') return null;
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(data)) return null;
  const out: AppointmentProductLine[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const productId = typeof obj.productId === 'string' ? obj.productId.trim() : '';
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    const quantity = Math.floor(Number(obj.quantity));
    const unitPrice = Math.round(Number(obj.unitPrice));
    if (!productId || !name) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
    const subtotal = quantity * unitPrice;
    out.push({ productId, name, quantity, unitPrice, subtotal });
    if (out.length >= MAX_APPOINTMENT_PRODUCT_LINES) break;
  }
  return out.length > 0 ? out : null;
}

/** Suma de subtotales en ARS (entero). */
export function sumAppointmentProducts(lines: AppointmentProductLine[] | null | undefined): number {
  if (!lines?.length) return 0;
  return lines.reduce((acc, l) => acc + (l.subtotal > 0 ? l.subtotal : 0), 0);
}
