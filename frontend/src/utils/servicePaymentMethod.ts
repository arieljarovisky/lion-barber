import type { Appointment, Service, ServicePaymentMethod, ServicePaymentSplit } from '../api';
import { calculateDepositAmountArs, resolveAppointmentServiceAmountArs } from './money';

export type { ServicePaymentMethod, ServicePaymentSplit };

export const SERVICE_PAYMENT_METHODS: ServicePaymentMethod[] = [
  'cash',
  'card',
  'transfer',
  'mercadopago',
];

export const SERVICE_PAYMENT_METHOD_LABELS: Record<ServicePaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
};

export function formatServicePaymentMethod(
  method: ServicePaymentMethod | null | undefined
): string {
  if (!method) return 'Sin registrar';
  return SERVICE_PAYMENT_METHOD_LABELS[method] ?? method;
}

export function sumServicePaymentSplits(splits: ServicePaymentSplit[] | null | undefined): number {
  if (!splits?.length) return 0;
  return splits.reduce((acc, s) => acc + (s.amount > 0 ? s.amount : 0), 0);
}

/** Texto corto para agenda / cierre de caja. */
export function formatServicePaymentSplits(
  splits: ServicePaymentSplit[] | null | undefined,
  legacyMethod?: ServicePaymentMethod | null,
  fallbackAmount?: number
): string {
  if (splits?.length) {
    return splits
      .map((s) => `${SERVICE_PAYMENT_METHOD_LABELS[s.method]} $${s.amount.toLocaleString('es-AR')}`)
      .join(' + ');
  }
  if (legacyMethod && fallbackAmount != null && fallbackAmount > 0) {
    return `${SERVICE_PAYMENT_METHOD_LABELS[legacyMethod]} $${fallbackAmount.toLocaleString('es-AR')}`;
  }
  if (legacyMethod) return SERVICE_PAYMENT_METHOD_LABELS[legacyMethod];
  return 'Sin registrar';
}

/** Reparte montos al cierre semanal (saldo en local). */
export function appointmentLocalPendingArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  const serviceAmount = resolveAppointmentServiceAmountArs(app, services) ?? 0;
  const deposit =
    app.depositPaid && serviceAmount > 0
      ? calculateDepositAmountArs(serviceAmount, depositPercent)
      : 0;
  return Math.max(0, serviceAmount - deposit);
}

export function initialSplitsFromAppointment(
  app: Appointment,
  services: Service[],
  depositPercent: number
): ServicePaymentSplit[] {
  if (app.servicePaymentSplits?.length) {
    return app.servicePaymentSplits.map((s) => ({ ...s }));
  }
  const local = appointmentLocalPendingArs(app, services, depositPercent);
  if (app.servicePaymentMethod && local > 0) {
    return [{ method: app.servicePaymentMethod, amount: local }];
  }
  return [];
}

export function cleanServicePaymentSplits(splits: ServicePaymentSplit[]): ServicePaymentSplit[] | null {
  const cleaned = splits.filter((s) => s.amount > 0);
  return cleaned.length > 0 ? cleaned : null;
}

export function applySplitsToMethodTotals(
  totals: Record<ServicePaymentMethod, number> & { unregistered: number },
  splits: ServicePaymentSplit[] | null | undefined,
  legacyMethod: ServicePaymentMethod | null | undefined,
  localPending: number
): void {
  if (localPending <= 0) return;

  if (splits?.length) {
    let assigned = 0;
    for (const s of splits) {
      if (s.amount > 0 && SERVICE_PAYMENT_METHODS.includes(s.method)) {
        totals[s.method] += s.amount;
        assigned += s.amount;
      }
    }
    const remainder = localPending - assigned;
    if (remainder > 0) totals.unregistered += remainder;
    return;
  }

  const bucket = legacyMethod ?? 'unregistered';
  totals[bucket] += localPending;
}
