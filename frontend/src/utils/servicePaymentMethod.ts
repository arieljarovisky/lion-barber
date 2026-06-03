import type { Appointment, ClientSubscriptionInfo, Service, ServicePaymentMethod, ServicePaymentSplit } from '../api';
import {
  resolveAppointmentDepositAmountArs,
  resolveAppointmentServiceAmountArs,
} from './money';

export type { ServicePaymentMethod, ServicePaymentSplit };

export const SERVICE_PAYMENT_METHODS: ServicePaymentMethod[] = [
  'account',
  'mercadopago',
  'cash',
  'card',
  'subscription',
];

export const SERVICE_PAYMENT_METHOD_LABELS: Record<ServicePaymentMethod, string> = {
  account: 'Cuenta Corriente',
  mercadopago: 'Mercado Pago',
  cash: 'Efectivo',
  card: 'Tarjeta',
  subscription: 'Abono',
};

export function formatServicePaymentMethod(
  method: ServicePaymentMethod | null | undefined
): string {
  if (!method) return 'Sin registrar';
  return SERVICE_PAYMENT_METHOD_LABELS[method] ?? method;
}

/** Monto que cuenta para cubrir el saldo del turno (deuda en CC = valor absoluto). */
export function effectiveSplitAmountArs(split: ServicePaymentSplit): number {
  if (split.method === 'account' && split.amount < 0) {
    return Math.round(Math.abs(split.amount));
  }
  if (split.amount > 0) return split.amount;
  return 0;
}

export function isValidSplitAmount(method: ServicePaymentMethod, amount: number): boolean {
  if (amount === 0) return false;
  if (amount < 0) return method === 'account';
  return true;
}

export function sumServicePaymentSplits(splits: ServicePaymentSplit[] | null | undefined): number {
  if (!splits?.length) return 0;
  return splits.reduce((acc, s) => acc + effectiveSplitAmountArs(s), 0);
}

/** Texto corto para agenda / cierre de caja. */
export function formatServicePaymentSplits(
  splits: ServicePaymentSplit[] | null | undefined,
  legacyMethod?: ServicePaymentMethod | null,
  fallbackAmount?: number
): string {
  if (splits?.length) {
    return splits
      .map((s) => {
        const label = SERVICE_PAYMENT_METHOD_LABELS[s.method];
        if (s.method === 'account' && s.amount < 0) {
          return `${label} −$${Math.abs(s.amount).toLocaleString('es-AR')} (debe)`;
        }
        return `${label} $${s.amount.toLocaleString('es-AR')}`;
      })
      .join(' + ');
  }
  if (legacyMethod && fallbackAmount != null && fallbackAmount > 0) {
    return `${SERVICE_PAYMENT_METHOD_LABELS[legacyMethod]} $${fallbackAmount.toLocaleString('es-AR')}`;
  }
  if (legacyMethod) return SERVICE_PAYMENT_METHOD_LABELS[legacyMethod];
  return 'Sin registrar';
}

/** Seña abonada online (monto real de MP si está guardado; si no, estimado al %). */
export function appointmentDepositAmountArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  return resolveAppointmentDepositAmountArs(app, services, depositPercent);
}

/** Reparte montos al cierre semanal (saldo en local, sin la seña). */
export function appointmentLocalPendingArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  const serviceAmount = resolveAppointmentServiceAmountArs(app, services) ?? 0;
  const deposit = resolveAppointmentDepositAmountArs(app, services, depositPercent);
  return Math.max(0, serviceAmount - deposit);
}

/** Suma que deben tener los cobros editables (saldo en local + productos). */
export function appointmentSplitsTargetArs(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal = 0
): number {
  return appointmentLocalPendingArs(app, services, depositPercent) + productsSubtotal;
}

/**
 * Los cobros guardados cubren el saldo del turno (servicio − seña + productos). La seña MP
 * va aparte (depositPaid). Corrige datos viejos que cargaban más del saldo esperado.
 */
export function normalizeAppointmentPaymentSplits(
  splits: ServicePaymentSplit[],
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal = 0
): ServicePaymentSplit[] {
  const target = appointmentSplitsTargetArs(app, services, depositPercent, productsSubtotal);
  if (target <= 0) return [];

  const cleaned = splits
    .filter((s) => isValidSplitAmount(s.method, Math.round(s.amount)))
    .map((s) => ({ ...s, amount: Math.round(s.amount) }));

  const sum = sumServicePaymentSplits(cleaned);
  if (sum <= target) return cleaned;

  if (cleaned.length === 1 && cleaned[0].amount > 0) {
    return [{ ...cleaned[0], amount: target }];
  }

  let excess = sum - target;
  const out = cleaned.map((s) => ({ ...s }));
  for (let i = out.length - 1; i >= 0 && excess > 0; i--) {
    if (out[i].amount <= 0) continue;
    const deduct = Math.min(out[i].amount, excess);
    out[i] = { ...out[i], amount: out[i].amount - deduct };
    excess -= deduct;
  }
  return out.filter((s) => isValidSplitAmount(s.method, s.amount));
}

/** Prefill de cobro con abono: servicio en Abono, productos aparte. */
export function buildSubscriptionPrefillSplits(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal: number
): ServicePaymentSplit[] {
  const servicePart = appointmentLocalPendingArs(app, services, depositPercent);
  const splits: ServicePaymentSplit[] = [];
  if (servicePart > 0) splits.push({ method: 'subscription', amount: servicePart });
  if (productsSubtotal > 0) splits.push({ method: 'cash', amount: productsSubtotal });
  return splits;
}

export function initialSplitsFromAppointment(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal = 0,
  clientSubscription?: ClientSubscriptionInfo | null
): ServicePaymentSplit[] {
  if (app.servicePaymentSplits?.length) {
    return normalizeAppointmentPaymentSplits(
      app.servicePaymentSplits.map((s) => ({ ...s })),
      app,
      services,
      depositPercent,
      productsSubtotal
    );
  }
  const target = appointmentSplitsTargetArs(app, services, depositPercent, productsSubtotal);
  if (app.subscriptionCutApplied && target > 0) {
    return buildSubscriptionPrefillSplits(app, services, depositPercent, productsSubtotal);
  }
  if (
    clientSubscription &&
    clientSubscription.cutsRemaining > 0 &&
    app.userId != null &&
    target > 0
  ) {
    return buildSubscriptionPrefillSplits(app, services, depositPercent, productsSubtotal);
  }
  if (
    app.servicePaymentMethod &&
    app.servicePaymentMethod !== 'mercadopago' &&
    target > 0
  ) {
    return [{ method: app.servicePaymentMethod, amount: target }];
  }
  return [];
}

/** Texto para agenda / modal: seña MP + cobros en local. */
export function formatAppointmentPaymentDisplay(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal = 0
): string {
  const parts: string[] = [];
  const deposit = appointmentDepositAmountArs(app, services, depositPercent);
  if (deposit > 0) {
    parts.push(
      `${SERVICE_PAYMENT_METHOD_LABELS.mercadopago} $${deposit.toLocaleString('es-AR')} (seña)`
    );
  }

  const localTarget = appointmentSplitsTargetArs(app, services, depositPercent, productsSubtotal);
  const splits = app.servicePaymentSplits;

  if (splits?.length) {
    for (const s of splits) {
      if (!isValidSplitAmount(s.method, s.amount)) continue;
      if (s.method === 'account' && s.amount < 0) {
        parts.push(
          `${SERVICE_PAYMENT_METHOD_LABELS.account} −$${Math.abs(s.amount).toLocaleString('es-AR')} (debe)`
        );
        continue;
      }
      if (s.amount > 0) {
        const suffix =
          s.method === 'subscription' && app.subscriptionCutApplied ? ' (1 corte)' : '';
        parts.push(
          `${SERVICE_PAYMENT_METHOD_LABELS[s.method]} $${s.amount.toLocaleString('es-AR')}${suffix}`
        );
      }
    }
  } else if (
    app.servicePaymentMethod &&
    app.servicePaymentMethod !== 'mercadopago' &&
    localTarget > 0
  ) {
    parts.push(
      `${SERVICE_PAYMENT_METHOD_LABELS[app.servicePaymentMethod]} $${localTarget.toLocaleString('es-AR')}`
    );
  }

  if (parts.length === 0) return 'Sin registrar';
  return parts.join(' + ');
}

export function cleanServicePaymentSplits(splits: ServicePaymentSplit[]): ServicePaymentSplit[] | null {
  const cleaned = splits.filter((s) => isValidSplitAmount(s.method, Math.round(s.amount)));
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
      } else if (s.method === 'account' && s.amount < 0) {
        assigned += Math.abs(s.amount);
      }
    }
    const remainder = localPending - assigned;
    if (remainder > 0) totals.unregistered += remainder;
    return;
  }

  const bucket = legacyMethod ?? 'unregistered';
  totals[bucket] += localPending;
}
