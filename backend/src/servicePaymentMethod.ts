/** Cómo se cobró el servicio (saldo en local o total si no hubo seña). */
export type ServicePaymentMethod = 'cash' | 'card' | 'transfer' | 'mercadopago';

export interface ServicePaymentSplit {
  method: ServicePaymentMethod;
  /** Monto en pesos (entero). */
  amount: number;
}

export const SERVICE_PAYMENT_METHODS: ServicePaymentMethod[] = [
  'cash',
  'card',
  'transfer',
  'mercadopago',
];

export const MAX_SERVICE_PAYMENT_SPLITS = 8;

export function parseServicePaymentMethod(raw: unknown): ServicePaymentMethod | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  return SERVICE_PAYMENT_METHODS.includes(s as ServicePaymentMethod) ? (s as ServicePaymentMethod) : null;
}

export function parseServicePaymentSplits(raw: unknown): ServicePaymentSplit[] | null {
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
  const out: ServicePaymentSplit[] = [];
  const used = new Set<ServicePaymentMethod>();
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const method = parseServicePaymentMethod((item as { method?: unknown }).method);
    const amount = Math.round(Number((item as { amount?: unknown }).amount));
    if (!method || amount <= 0) continue;
    if (used.has(method)) continue;
    used.add(method);
    out.push({ method, amount });
    if (out.length >= MAX_SERVICE_PAYMENT_SPLITS) break;
  }
  return out.length > 0 ? out : null;
}

export const SERVICE_PAYMENT_METHOD_LABELS: Record<ServicePaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
};
