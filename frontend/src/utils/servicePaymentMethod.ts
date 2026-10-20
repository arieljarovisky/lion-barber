import type { Appointment, ClientSubscriptionInfo, Service, ServicePaymentMethod, ServicePaymentSplit } from '../api';
import {
  barberCanjeSkipsCommission,
  SUBSCRIPTION_COMMISSION_PAID_CUTS,
  SUBSCRIPTION_INCLUDED_CUTS,
  subscriptionCutCostArs,
} from '../constants/barberBusiness';
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
  'canje',
  'canje100',
];

export const SERVICE_PAYMENT_METHOD_LABELS: Record<ServicePaymentMethod, string> = {
  account: 'Cuenta Corriente',
  mercadopago: 'Mercado Pago',
  cash: 'Efectivo',
  card: 'Tarjeta',
  subscription: 'Abono',
  canje: 'Canje',
  canje100: 'Canje 100%',
};

/** Color de un pago ya registrado que todavía no salda el turno. */
export const REGISTERED_PAYMENT_CLASS = 'border-blue-400 bg-blue-100 text-blue-950';

/** Casillero cuando seña y cobros cubren el total, sin deuda en cuenta corriente. */
export const FULLY_PAID_PAYMENT_CLASS = 'border-emerald-600 bg-emerald-200 text-emerald-950';

/** Propina, aparte de los cobros del turno. */
export const TIP_PAINTED_CLASS = 'border-[#7a2d3c] bg-[#f6e4e8] text-[#6b2030]';

/** Color de la forma de pago cuando está seleccionada. */
export const SERVICE_PAYMENT_METHOD_SELECTED_CLASS: Record<ServicePaymentMethod, string> = {
  account: REGISTERED_PAYMENT_CLASS,
  mercadopago: REGISTERED_PAYMENT_CLASS,
  cash: REGISTERED_PAYMENT_CLASS,
  card: REGISTERED_PAYMENT_CLASS,
  subscription: REGISTERED_PAYMENT_CLASS,
  canje: REGISTERED_PAYMENT_CLASS,
  canje100: REGISTERED_PAYMENT_CLASS,
};

/** Abono y canjes: no ingresan efectivo en caja en el turno. */
export const NON_CASH_LOCAL_PAYMENT_METHODS: ServicePaymentMethod[] = ['subscription', 'canje', 'canje100'];

export function isNonCashLocalPaymentMethod(method: ServicePaymentMethod): boolean {
  return NON_CASH_LOCAL_PAYMENT_METHODS.includes(method);
}

export function formatServicePaymentMethod(
  method: ServicePaymentMethod | null | undefined
): string {
  if (!method) return 'Sin registrar';
  return SERVICE_PAYMENT_METHOD_LABELS[method] ?? method;
}

/** Monto que cuenta para cubrir el saldo del turno (deuda en CC = valor absoluto). */
export function effectiveSplitAmountArs(split: ServicePaymentSplit): number {
  if (split.method === 'account' && split.amount !== 0) {
    return Math.round(Math.abs(split.amount));
  }
  if (split.amount > 0) return split.amount;
  return 0;
}

/** Importe fiado en cuenta corriente: el cliente no pagó esa plata. */
export function accountDebtArsFromSplits(splits: ServicePaymentSplit[] | null | undefined): number {
  if (!splits?.length) return 0;
  let total = 0;
  for (const split of splits) {
    if (split.method !== 'account' || !Number.isFinite(split.amount) || split.amount === 0) continue;
    total += Math.abs(Math.round(split.amount));
  }
  return total;
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
        if (s.method === 'account') {
          return `${label} $${Math.abs(s.amount).toLocaleString('es-AR')} (debe)`;
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
  if (app.promotionFullyPaid) return 0;
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

export type AppointmentPaymentDisplayPart = {
  text: string;
  method: ServicePaymentMethod | null;
};

function formatRegisteredPaymentAmount(amount: number): string {
  return `$${amount.toLocaleString('es-AR')}`;
}

/**
 * Seña y saldo en Mercado Pago se muestran como un solo cobro.
 * Si el saldo usa otro método, la seña sigue aparte.
 */
function collapseMercadoPagoParts(
  parts: AppointmentPaymentDisplayPart[],
  mercadoPagoTotal: number,
  mercadoPagoCount: number
): AppointmentPaymentDisplayPart[] {
  if (mercadoPagoCount < 2 || mercadoPagoTotal <= 0) return parts;
  const text = `${SERVICE_PAYMENT_METHOD_LABELS.mercadopago} ${formatRegisteredPaymentAmount(mercadoPagoTotal)}`;
  let placed = false;
  return parts.flatMap((part) => {
    if (part.method !== 'mercadopago') return [part];
    if (placed) return [];
    placed = true;
    return [{ method: 'mercadopago', text }];
  });
}

/** Partes de cobro para agenda / modal, con el método para pintar cada una. */
export function appointmentPaymentDisplayParts(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal = 0
): AppointmentPaymentDisplayPart[] {
  const parts: AppointmentPaymentDisplayPart[] = [];
  let mercadoPagoTotal = 0;
  let mercadoPagoCount = 0;
  const deposit = appointmentDepositAmountArs(app, services, depositPercent);
  if (deposit > 0) {
    mercadoPagoTotal += deposit;
    mercadoPagoCount += 1;
    parts.push({
      method: 'mercadopago',
      text: `${SERVICE_PAYMENT_METHOD_LABELS.mercadopago} ${formatRegisteredPaymentAmount(deposit)} (seña)`,
    });
  }

  const localTarget = appointmentSplitsTargetArs(app, services, depositPercent, productsSubtotal);
  const splits = app.servicePaymentSplits;

  if (splits?.length) {
    for (const s of splits) {
      if (!isValidSplitAmount(s.method, s.amount)) continue;
      if (s.method === 'account') {
        parts.push({
          method: 'account',
          text: `${SERVICE_PAYMENT_METHOD_LABELS.account} ${formatRegisteredPaymentAmount(Math.abs(s.amount))} (debe)`,
        });
        continue;
      }
      if (s.amount > 0) {
        if (s.method === 'mercadopago') {
          mercadoPagoTotal += s.amount;
          mercadoPagoCount += 1;
        }
        const suffix =
          s.method === 'subscription' && app.subscriptionCutApplied
            ? ' (1 corte)'
            : s.method === 'canje'
              ? ' (puntos)'
              : s.method === 'canje100'
                ? ' (100%)'
                : '';
        parts.push({
          method: s.method,
          text: `${SERVICE_PAYMENT_METHOD_LABELS[s.method]} ${formatRegisteredPaymentAmount(s.amount)}${suffix}`,
        });
      }
    }
  } else if (
    app.servicePaymentMethod &&
    app.servicePaymentMethod !== 'mercadopago' &&
    localTarget > 0
  ) {
    parts.push({
      method: app.servicePaymentMethod,
      text: `${SERVICE_PAYMENT_METHOD_LABELS[app.servicePaymentMethod]} ${formatRegisteredPaymentAmount(localTarget)}`,
    });
  }

  return collapseMercadoPagoParts(parts, mercadoPagoTotal, mercadoPagoCount);
}

/** Cobros en local que sí ingresaron (cuenta corriente no cuenta: el cliente sigue debiendo). */
function registeredSettledLocalArs(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal: number
): number {
  const splits = app.servicePaymentSplits;
  if (splits?.length) {
    let total = 0;
    for (const split of splits) {
      if (split.method === 'account' || !(split.amount > 0)) continue;
      total += split.amount;
    }
    return total;
  }
  if (
    app.servicePaymentMethod &&
    app.servicePaymentMethod !== 'mercadopago' &&
    app.servicePaymentMethod !== 'account'
  ) {
    return appointmentSplitsTargetArs(app, services, depositPercent, productsSubtotal);
  }
  return 0;
}

/**
 * El turno está saldado: la seña (si la hubo) más los cobros cubren servicio y productos.
 * Cuenta corriente deja el casillero en azul, porque ese monto sigue debiendo.
 */
export function isAppointmentFullyPaid(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal = 0
): boolean {
  const serviceAmount = Math.round(resolveAppointmentServiceAmountArs(app, services) ?? 0);
  const products = Math.max(0, Math.round(productsSubtotal));
  if (serviceAmount <= 0 && products <= 0) return false;
  if (accountDebtArsFromSplits(app.servicePaymentSplits) > 0) return false;

  const localPaid = registeredSettledLocalArs(app, services, depositPercent, products);
  if (app.promotionFullyPaid) {
    return products <= 0 || localPaid + 0.5 >= products;
  }

  const deposit = appointmentDepositAmountArs(app, services, depositPercent);
  return deposit + localPaid + 0.5 >= serviceAmount + products;
}

/** Texto para agenda / modal: seña MP + cobros en local. */
export function formatAppointmentPaymentDisplay(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  productsSubtotal = 0
): string {
  const parts = appointmentPaymentDisplayParts(app, services, depositPercent, productsSubtotal);
  if (parts.length === 0) return 'Sin registrar';
  return parts.map((p) => p.text).join(' + ');
}

export function cleanServicePaymentSplits(splits: ServicePaymentSplit[]): ServicePaymentSplit[] | null {
  const cleaned = splits.filter((s) => isValidSplitAmount(s.method, Math.round(s.amount)));
  return cleaned.length > 0 ? cleaned : null;
}

/** Reparte montos al cierre semanal (saldo en local, sin la seña). Excluye abono y canje. */
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
      if (isNonCashLocalPaymentMethod(s.method)) continue;
      if (s.method === 'account') {
        const debt = Math.abs(Math.round(s.amount));
        if (debt > 0) {
          totals.account += debt;
          assigned += debt;
        }
        continue;
      }
      if (s.amount > 0 && SERVICE_PAYMENT_METHODS.includes(s.method)) {
        totals[s.method] += s.amount;
        assigned += s.amount;
      }
    }
    const remainder = localPending - assigned;
    if (remainder > 0) totals.unregistered += remainder;
    return;
  }

  if (legacyMethod && isNonCashLocalPaymentMethod(legacyMethod)) return;

  const bucket = legacyMethod ?? 'unregistered';
  totals[bucket] += localPending;
}

function nonCashSplitAmountArs(
  splits: ServicePaymentSplit[] | null | undefined,
  method: ServicePaymentMethod
): number {
  if (!splits?.length) return 0;
  return splits.reduce(
    (acc, s) => (s.method === method && s.amount > 0 ? acc + s.amount : acc),
    0
  );
}

/** Monto del saldo local cubierto con abono (no ingresa a caja en el turno). */
export function appointmentSubscriptionLocalAmountArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  const localTarget = appointmentLocalPendingArs(app, services, depositPercent);
  if (localTarget <= 0) return 0;

  const fromSplits = nonCashSplitAmountArs(app.servicePaymentSplits, 'subscription');
  if (fromSplits > 0) return Math.min(localTarget, fromSplits);

  if (app.subscriptionCutApplied) return localTarget;
  if (app.servicePaymentMethod === 'subscription') return localTarget;
  return 0;
}

function appointmentMethodLocalAmountArs(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  method: ServicePaymentMethod
): number {
  const localTarget = appointmentLocalPendingArs(app, services, depositPercent);
  if (localTarget <= 0) return 0;

  const fromSplits = nonCashSplitAmountArs(app.servicePaymentSplits, method);
  if (fromSplits > 0) return Math.min(localTarget, fromSplits);

  if (app.servicePaymentMethod === method) return localTarget;
  return 0;
}

/** Monto del saldo local cubierto con canje (no ingresa a caja). Comisión al 50%, salvo Agustín. */
export function appointmentCanjeLocalAmountArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  return appointmentMethodLocalAmountArs(app, services, depositPercent, 'canje');
}

/** Canje al 100%: no ingresa a caja y no genera comisión para el barbero ni para el local. */
export function appointmentCanje100LocalAmountArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  return appointmentMethodLocalAmountArs(app, services, depositPercent, 'canje100');
}

/** Abono + canjes: parte del servicio sin ingreso en caja al momento del turno. */
export function appointmentNonCashLocalAmountArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  const localTarget = appointmentLocalPendingArs(app, services, depositPercent);
  if (localTarget <= 0) return 0;

  const subscription = appointmentSubscriptionLocalAmountArs(app, services, depositPercent);
  const canje = appointmentCanjeLocalAmountArs(app, services, depositPercent);
  const canje100 = appointmentCanje100LocalAmountArs(app, services, depositPercent);
  return Math.min(localTarget, subscription + canje + canje100);
}

/** Saldo en local a cobrar en el turno (incluye lo fiado en cuenta corriente), sin abono. */
export function appointmentCollectibleLocalArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  return Math.max(
    0,
    appointmentLocalPendingArs(app, services, depositPercent) -
      appointmentNonCashLocalAmountArs(app, services, depositPercent)
  );
}

/**
 * Base de comisión de un corte de abono.
 * Con el plan guardado en el turno: precio del abono ÷ cantidad de cortes
 * (ej. $192.000 / 10 = $19.200; al 50% el barbero se lleva $9.600).
 * Sin ese dato, se usa 5/6 del valor cubierto.
 */
export function subscriptionCommissionBaseArs(
  subscriptionCoverage: number,
  planPriceArs?: number | null,
  planCuts?: number | null
): number {
  if (subscriptionCoverage <= 0) return 0;
  const cutCost = subscriptionCutCostArs(planPriceArs, planCuts);
  if (cutCost != null) return cutCost;
  return Math.round(
    (subscriptionCoverage * SUBSCRIPTION_COMMISSION_PAID_CUTS) / SUBSCRIPTION_INCLUDED_CUTS
  );
}

/**
 * Base de comisión del servicio.
 * Abono: costo de un corte del plan (precio ÷ cortes). Canje: el total, salvo Agustín (0).
 * Canje 100%: 0 para todos. Cuenta corriente y cobros en efectivo, tarjeta o Mercado Pago suman el total.
 */
export function appointmentCommissionableServiceAmountArs(
  app: Appointment,
  services: Service[],
  depositPercent: number,
  barberName?: string | null
): number {
  const serviceAmount = resolveAppointmentServiceAmountArs(app, services) ?? 0;
  const subscriptionCoverage = appointmentSubscriptionLocalAmountArs(app, services, depositPercent);
  const canje100 = appointmentCanje100LocalAmountArs(app, services, depositPercent);
  const canje = appointmentCanjeLocalAmountArs(app, services, depositPercent);
  const canjeWithoutCommission = barberCanjeSkipsCommission(barberName ?? app.barber) ? canje : 0;
  const excluded = Math.min(
    serviceAmount,
    subscriptionCoverage + canje100 + canjeWithoutCommission
  );
  const charged = Math.max(0, serviceAmount - excluded);
  return (
    charged +
    subscriptionCommissionBaseArs(
      subscriptionCoverage,
      app.subscriptionPlanPriceArs,
      app.subscriptionPlanCuts
    )
  );
}
