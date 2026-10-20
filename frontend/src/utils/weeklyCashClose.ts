import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addDays,
  subDays,
  format,
  parseISO,
  isWithinInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  Appointment,
  AppointmentProductLine,
  Barber,
  Service,
  ServicePaymentMethod,
  ServicePaymentSplit,
} from '../api';
import { BARBER_COMMISSION_PERCENT, BARBER_PRODUCT_COMMISSION_PERCENT } from '../constants/barberBusiness';
import { sumAppointmentProducts } from './appointmentProducts';
import { resolveAppointmentDepositAmountArs, resolveAppointmentServiceAmountArs } from './money';
import {
  SERVICE_PAYMENT_METHODS,
  SERVICE_PAYMENT_METHOD_LABELS,
  accountDebtArsFromSplits,
  appointmentCanje100LocalAmountArs,
  appointmentCanjeLocalAmountArs,
  appointmentCollectibleLocalArs,
  appointmentCommissionableServiceAmountArs,
  appointmentSubscriptionLocalAmountArs,
  applySplitsToMethodTotals,
  isNonCashLocalPaymentMethod,
} from './servicePaymentMethod';

/** Semana de cierre: lunes a domingo (Argentina). */
export const WEEK_OPTS = { weekStartsOn: 1 as const, locale: es };

export type CashClosePeriodMode = 'week' | 'day' | 'month';

export function dayBoundsFromAnchor(anchor: Date): { start: Date; end: Date; fromYmd: string; toYmd: string } {
  const start = startOfDay(anchor);
  const end = endOfDay(anchor);
  const ymd = format(start, 'yyyy-MM-dd');
  return { start, end, fromYmd: ymd, toYmd: ymd };
}

export function formatDayLabel(day: Date): string {
  return format(day, "EEEE d 'de' MMMM yyyy", { locale: es });
}

export function shiftDayAnchor(anchor: Date, deltaDays: number): Date {
  return deltaDays >= 0 ? addDays(anchor, deltaDays) : subDays(anchor, Math.abs(deltaDays));
}

export function monthBoundsFromAnchor(anchor: Date): { start: Date; end: Date; fromYmd: string; toYmd: string } {
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  return {
    start,
    end,
    fromYmd: format(start, 'yyyy-MM-dd'),
    toYmd: format(end, 'yyyy-MM-dd'),
  };
}

export function formatMonthLabel(monthStart: Date): string {
  return format(monthStart, "MMMM yyyy", { locale: es });
}

export function shiftMonthAnchor(anchor: Date, deltaMonths: number): Date {
  return deltaMonths >= 0 ? addMonths(anchor, deltaMonths) : subMonths(anchor, Math.abs(deltaMonths));
}

export function periodBoundsFromAnchor(
  anchor: Date,
  mode: CashClosePeriodMode
): { start: Date; end: Date; fromYmd: string; toYmd: string } {
  if (mode === 'day') return dayBoundsFromAnchor(anchor);
  if (mode === 'month') return monthBoundsFromAnchor(anchor);
  return weekBoundsFromAnchor(anchor);
}

export function formatPeriodLabel(start: Date, end: Date, mode: CashClosePeriodMode): string {
  if (mode === 'day') return formatDayLabel(start);
  if (mode === 'month') return formatMonthLabel(start);
  return formatWeekLabel(start, end);
}

export function weekBoundsFromAnchor(anchor: Date): { start: Date; end: Date; fromYmd: string; toYmd: string } {
  const start = startOfWeek(anchor, WEEK_OPTS);
  const end = endOfWeek(anchor, WEEK_OPTS);
  return {
    start,
    end,
    fromYmd: format(start, 'yyyy-MM-dd'),
    toYmd: format(end, 'yyyy-MM-dd'),
  };
}

export function formatWeekLabel(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${format(start, "d", { locale: es })} – ${format(end, "d 'de' MMMM yyyy", { locale: es })}`;
  }
  return `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;
}

export type WeeklyCashRow = {
  appointmentId: string;
  date: string;
  time: string;
  clientName: string;
  clientUserId?: number;
  serviceName: string;
  barberKey: string;
  barberName: string;
  serviceAmount: number;
  /** Parte del saldo local cubierta con abono (no entra a caja en el turno). */
  subscriptionAmount: number;
  /** Parte del saldo local cubierta con canje (comisión al 50%, salvo Agustín). */
  canjeAmount: number;
  /** Canje al 100%: referencia, sin comisión para el barbero ni para el local. */
  canje100Amount: number;
  depositAmount: number;
  depositPaid: boolean;
  localPending: number;
  commissionPercent: number;
  serviceCommissionAmount: number;
  productCommissionAmount: number;
  productsSoldAmount: number;
  /** Productos cargados al cobrar el turno en la agenda. */
  productLines: AppointmentProductLine[];
  commissionAmount: number;
  afipTotal: number | null;
  afipInvoiced: boolean;
  status: string;
  servicePaymentMethod: ServicePaymentMethod | null;
  servicePaymentSplits: ServicePaymentSplit[] | null;
  tipAmount: number;
};

export type PaymentMethodTotals = Record<ServicePaymentMethod, number> & {
  unregistered: number;
};

export function emptyPaymentMethodTotals(): PaymentMethodTotals {
  const base = { unregistered: 0 } as PaymentMethodTotals;
  for (const m of SERVICE_PAYMENT_METHODS) base[m] = 0;
  return base;
}

export type WeeklyBarberSummary = {
  barberKey: string;
  barberName: string;
  appointments: number;
  serviceGross: number;
  /** Productos del turno y, si se asignan, ventas de mostrador. */
  productsSold: number;
  depositsMp: number;
  localPending: number;
  commission: number;
  afipInvoiced: number;
  tips: number;
};

export type WeeklyCashSummary = {
  appointments: number;
  cancelledInWeek: number;
  serviceGross: number;
  depositsMp: number;
  localPending: number;
  commissions: number;
  /** Valor de servicios cubiertos con abono o canje en el período (referencia, no ingreso en caja). */
  nonCashServiceTotal: number;
  shopNetEstimate: number;
  afipInvoicedTotal: number;
  afipInvoicedCount: number;
  pendingAfipCount: number;
  /** Saldo en local agrupado por método registrado (sin método → unregistered). */
  localByMethod: PaymentMethodTotals;
  /** Parte de cada método que corresponde a ventas de productos (ya incluida en localByMethod cuando entra a caja). */
  productsByMethod: PaymentMethodTotals;
  /** Abono y canjes: referencia, no ingresan a caja. */
  nonCashByMethod: PaymentMethodTotals;
  /** Señas MP (siempre mercadopago en depósitos). */
  depositsMpByMethod: PaymentMethodTotals;
  tipsTotal: number;
  /** Ventas de productos en mostrador. Entran en caja y no generan comisión. */
  counterSalesTotal: number;
  /** Productos cobrados dentro de un turno. Entran en caja y sí generan comisión. */
  appointmentProductsTotal: number;
};

function rowAccountDebtArs(row: WeeklyCashRow): number {
  const fromSplits = accountDebtArsFromSplits(row.servicePaymentSplits);
  if (fromSplits > 0) return fromSplits;
  if (row.servicePaymentMethod === 'account' && !row.servicePaymentSplits?.length) return row.localPending;
  return 0;
}

function resolveBarber(
  app: Appointment,
  barbers: Barber[]
): { key: string; name: string; commissionPercent: number } {
  const id = app.barberId ?? '';
  if (id) {
    const b = barbers.find((x) => x.id === id);
    return {
      key: id,
      name: b?.name ?? app.barber ?? 'Sin barbero',
      commissionPercent: b?.commissionPercent ?? BARBER_COMMISSION_PERCENT,
    };
  }
  const name = app.barber ?? 'Sin barbero';
  return { key: `name:${name}`, name, commissionPercent: BARBER_COMMISSION_PERCENT };
}

function afipAmountForAppointment(app: Appointment, fallbackService: number): number | null {
  if (!app.afipCae) return null;
  const detail = app.afipInvoiceDetail;
  if (detail && typeof detail.total === 'number' && detail.total > 0) return detail.total;
  return fallbackService > 0 ? fallbackService : null;
}

function invoicedProductsGross(app: Appointment): number {
  const detail = app.afipInvoiceDetail;
  if (detail?.productsTotal != null && detail.productsTotal > 0) {
    return Math.round(detail.productsTotal * 100) / 100;
  }
  const lines = detail?.productLines;
  if (!lines?.length) return 0;
  return Math.round(lines.reduce((s, l) => s + (l.subtotal > 0 ? l.subtotal : 0), 0) * 100) / 100;
}

/** Venta de productos del turno. Cuenta al cargarlos; si la factura trae un importe mayor, se usa ese. */
function productsGrossFromAppointment(app: Appointment): number {
  const fromTurn = sumAppointmentProducts(app.products);
  return Math.max(fromTurn, invoicedProductsGross(app));
}

function productCommissionFromAppointment(productsGross: number): number {
  if (productsGross <= 0) return 0;
  return Math.round((productsGross * BARBER_PRODUCT_COMMISSION_PERCENT) / 100);
}

function barberCommissionsForAppointment(
  app: Appointment,
  serviceAmount: number,
  commissionPercent: number
): {
  serviceCommissionAmount: number;
  productCommissionAmount: number;
  productsSoldAmount: number;
  commissionAmount: number;
} {
  const serviceCommissionAmount =
    serviceAmount > 0 ? Math.round((serviceAmount * commissionPercent) / 100) : 0;
  const productsSoldAmount = productsGrossFromAppointment(app);
  const productCommissionAmount = productCommissionFromAppointment(productsSoldAmount);
  return {
    serviceCommissionAmount,
    productCommissionAmount,
    productsSoldAmount,
    commissionAmount: serviceCommissionAmount + productCommissionAmount,
  };
}

export function buildWeeklyCashClose(
  appointments: Appointment[],
  services: Service[],
  barbers: Barber[],
  depositPercent: number,
  weekStart: Date,
  weekEnd: Date
): { rows: WeeklyCashRow[]; byBarber: WeeklyBarberSummary[]; summary: WeeklyCashSummary } {
  const interval = { start: weekStart, end: weekEnd };
  const rows: WeeklyCashRow[] = [];
  let cancelledInWeek = 0;

  for (const app of appointments) {
    const d = String(app.date).slice(0, 10);
    let day: Date;
    try {
      day = parseISO(`${d}T12:00:00`);
    } catch {
      continue;
    }
    if (!isWithinInterval(day, interval)) continue;

    if (app.status === 'cancelled') {
      cancelledInWeek += 1;
      continue;
    }
    if (app.status === 'pending_payment') continue;

    const serviceAmount = resolveAppointmentServiceAmountArs(app, services) ?? 0;
    const subscriptionAmount = appointmentSubscriptionLocalAmountArs(app, services, depositPercent);
    const canjeAmount = appointmentCanjeLocalAmountArs(app, services, depositPercent);
    const canje100Amount = appointmentCanje100LocalAmountArs(app, services, depositPercent);
    const collectibleLocal = appointmentCollectibleLocalArs(app, services, depositPercent);
    const { key, name, commissionPercent } = resolveBarber(app, barbers);

    const hasLocalPaymentRegistered =
      app.servicePaymentMethod != null ||
      (app.servicePaymentSplits != null && app.servicePaymentSplits.length > 0);

    const noLocalPaymentNeeded = collectibleLocal <= 0;

    const localPaymentComplete = hasLocalPaymentRegistered || noLocalPaymentNeeded;

    const depositAmount =
      app.depositPaid && serviceAmount > 0 && localPaymentComplete
        ? resolveAppointmentDepositAmountArs(app, services, depositPercent)
        : 0;
    const commissionableService = appointmentCommissionableServiceAmountArs(
      app,
      services,
      depositPercent,
      name
    );
    const commissions = barberCommissionsForAppointment(app, commissionableService, commissionPercent);
    const afipTotal = afipAmountForAppointment(app, serviceAmount);
    const tipAmount =
      app.tipAmount != null && Number.isFinite(app.tipAmount) && app.tipAmount > 0
        ? Math.round(app.tipAmount * 100) / 100
        : 0;

    rows.push({
      appointmentId: app.id,
      date: d,
      time: app.time,
      clientName: app.name,
      clientUserId: app.userId,
      serviceName: app.service,
      barberKey: key,
      barberName: name,
      serviceAmount,
      subscriptionAmount,
      canjeAmount,
      canje100Amount,
      depositAmount,
      depositPaid: Boolean(app.depositPaid),
      localPending: collectibleLocal,
      commissionPercent,
      serviceCommissionAmount: commissions.serviceCommissionAmount,
      productCommissionAmount: commissions.productCommissionAmount,
      productsSoldAmount: commissions.productsSoldAmount,
      productLines: (app.products ?? []).filter((line) => line.quantity > 0 && line.subtotal > 0),
      commissionAmount: commissions.commissionAmount,
      afipTotal,
      afipInvoiced: Boolean(app.afipCae),
      status: app.status ?? 'scheduled',
      servicePaymentMethod: app.servicePaymentMethod ?? null,
      servicePaymentSplits: app.servicePaymentSplits ?? null,
      tipAmount,
    });
  }

  rows.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const byBarberMap = new Map<string, WeeklyBarberSummary>();
  for (const r of rows) {
    let b = byBarberMap.get(r.barberKey);
    if (!b) {
      b = {
        barberKey: r.barberKey,
        barberName: r.barberName,
        appointments: 0,
        serviceGross: 0,
        productsSold: 0,
        depositsMp: 0,
        localPending: 0,
        commission: 0,
        afipInvoiced: 0,
        tips: 0,
      };
      byBarberMap.set(r.barberKey, b);
    }
    const cashLocal = Math.max(0, r.localPending - rowAccountDebtArs(r));
    b.appointments += 1;
    b.serviceGross += r.depositAmount + cashLocal;
    b.productsSold += r.productsSoldAmount;
    b.depositsMp += r.depositAmount;
    b.localPending += cashLocal;
    b.commission += r.commissionAmount;
    if (r.afipTotal != null) b.afipInvoiced += r.afipTotal;
    b.tips += r.tipAmount;
  }

  const byBarber = [...byBarberMap.values()].sort((a, b) =>
    a.barberName.localeCompare(b.barberName, 'es', { sensitivity: 'base' })
  );

  const summary: WeeklyCashSummary = rows.reduce(
    (acc, r) => {
      acc.appointments += 1;
      acc.serviceGross += r.depositAmount + r.localPending;
      acc.depositsMp += r.depositAmount;
      acc.localPending += r.localPending;
      acc.commissions += r.commissionAmount;
      acc.nonCashServiceTotal += r.subscriptionAmount + r.canjeAmount + r.canje100Amount;
      acc.nonCashByMethod.subscription += r.subscriptionAmount;
      acc.nonCashByMethod.canje += r.canjeAmount;
      acc.nonCashByMethod.canje100 += r.canje100Amount;
      if (r.depositAmount > 0) {
        acc.depositsMpByMethod.mercadopago += r.depositAmount;
      }
      if (r.localPending > 0) {
        applySplitsToMethodTotals(
          acc.localByMethod,
          r.servicePaymentSplits,
          r.servicePaymentMethod,
          r.localPending
        );
      }
      if (r.afipInvoiced) {
        acc.afipInvoicedCount += 1;
        acc.afipInvoicedTotal += r.afipTotal ?? 0;
      } else if (r.serviceAmount > 0) {
        acc.pendingAfipCount += 1;
      }
      return acc;
    },
    {
      appointments: 0,
      cancelledInWeek: cancelledInWeek,
      serviceGross: 0,
      depositsMp: 0,
      localPending: 0,
      commissions: 0,
      nonCashServiceTotal: 0,
      shopNetEstimate: 0,
      afipInvoicedTotal: 0,
      afipInvoicedCount: 0,
      pendingAfipCount: 0,
      localByMethod: emptyPaymentMethodTotals(),
      productsByMethod: emptyPaymentMethodTotals(),
      nonCashByMethod: emptyPaymentMethodTotals(),
      depositsMpByMethod: emptyPaymentMethodTotals(),
      tipsTotal: 0,
      counterSalesTotal: 0,
      appointmentProductsTotal: 0,
    }
  );
  summary.tipsTotal = rows.reduce((s, r) => s + r.tipAmount, 0);
  const fiadoEnCaja = rows.reduce(
    (sum, r) => sum + Math.min(r.localPending, rowAccountDebtArs(r)),
    0
  );
  summary.serviceGross = Math.max(0, summary.serviceGross - fiadoEnCaja);
  summary.localPending = Math.max(0, summary.localPending - fiadoEnCaja);
  summary.shopNetEstimate = summary.serviceGross - summary.commissions;
  applyAppointmentProductsToSummary(summary, rows);

  return { rows, byBarber, summary };
}

function cashPaidSplits(row: WeeklyCashRow): ServicePaymentSplit[] {
  return (row.servicePaymentSplits ?? []).filter(
    (split) =>
      split.amount > 0 &&
      split.method !== 'account' &&
      !isNonCashLocalPaymentMethod(split.method)
  );
}

/** El cobro del turno ya metió plata de productos en el desglose por método. */
function productAmountAlreadyBooked(row: WeeklyCashRow): number {
  const paid = cashPaidSplits(row);
  if (!paid.length) return 0;
  const splitSum = paid.reduce((sum, split) => sum + split.amount, 0);
  return Math.max(0, splitSum - row.localPending);
}

function appointmentProductsEnterCash(row: WeeklyCashRow): boolean {
  if (cashPaidSplits(row).length > 0) return true;
  const method = row.servicePaymentMethod;
  if (!method || method === 'account' || isNonCashLocalPaymentMethod(method)) return false;
  return !row.servicePaymentSplits?.length;
}

function attributeProductGap(row: WeeklyCashRow, gap: number, totals: PaymentMethodTotals): void {
  attributeProductAmount(row, gap, totals);
}

/** Reparte el importe de productos entre los métodos con los que se cobró el turno. */
function attributeProductAmount(row: WeeklyCashRow, amount: number, totals: PaymentMethodTotals): void {
  if (amount <= 0) return;
  const paid = cashPaidSplits(row);
  if (paid.length === 1) {
    totals[paid[0]!.method] += amount;
    return;
  }
  if (paid.length > 1) {
    const sum = paid.reduce((total, split) => total + split.amount, 0);
    if (sum <= 0) {
      totals.unregistered += amount;
      return;
    }
    let assigned = 0;
    for (let i = 0; i < paid.length; i++) {
      const split = paid[i]!;
      const share = i === paid.length - 1 ? amount - assigned : Math.round((amount * split.amount) / sum);
      totals[split.method] += share;
      assigned += share;
    }
    return;
  }
  const method = row.servicePaymentMethod;
  if (method && method !== 'account' && !isNonCashLocalPaymentMethod(method)) {
    totals[method] += amount;
    return;
  }
  totals.unregistered += amount;
}

/** Suma los productos del turno a la caja. Si el cobro ya los tenía en el método, no los duplica. */
function applyAppointmentProductsToSummary(summary: WeeklyCashSummary, rows: WeeklyCashRow[]): void {
  const localByMethod = { ...summary.localByMethod };
  const productsByMethod = emptyPaymentMethodTotals();
  let listed = 0;
  let inCash = 0;
  for (const row of rows) {
    if (row.productsSoldAmount <= 0) continue;
    listed += row.productsSoldAmount;
    if (!appointmentProductsEnterCash(row)) continue;
    inCash += row.productsSoldAmount;
    attributeProductAmount(row, row.productsSoldAmount, productsByMethod);
    const gap = Math.max(0, row.productsSoldAmount - productAmountAlreadyBooked(row));
    if (gap > 0) attributeProductGap(row, gap, localByMethod);
  }
  summary.localByMethod = localByMethod;
  summary.productsByMethod = productsByMethod;
  summary.appointmentProductsTotal = listed;
  summary.localPending += inCash;
  summary.shopNetEstimate += inCash;
}

export function formatAppointmentProductPaymentLabel(row: WeeklyCashRow): string {
  const splits = (row.servicePaymentSplits ?? []).filter((split) => split.amount !== 0);
  if (splits.length > 0) {
    const labels = [...new Set(splits.map((split) => SERVICE_PAYMENT_METHOD_LABELS[split.method]))];
    return labels.join(' + ');
  }
  if (row.servicePaymentMethod) return SERVICE_PAYMENT_METHOD_LABELS[row.servicePaymentMethod];
  return 'En el turno';
}

/** Seña de Mercado Pago + cobrado en local. Incluye productos del turno y los abonos de Nueva venta. */
export function cashBoxIncomeArs(
  summary: Pick<WeeklyCashSummary, 'depositsMp' | 'localPending'>
): number {
  return summary.depositsMp + summary.localPending;
}

/** Suma ventas de mostrador al cobrado en local y al neto. La comisión no cambia. */
export function applyCounterSalesToCashClose(
  summary: WeeklyCashSummary,
  sales: { totalArs: number; paymentMethod: 'cash' | 'card' | 'mercadopago' }[]
): WeeklyCashSummary {
  const localByMethod = { ...summary.localByMethod };
  const productsByMethod = { ...(summary.productsByMethod ?? emptyPaymentMethodTotals()) };
  let total = 0;
  for (const sale of sales) {
    const amount = Math.round(Number(sale.totalArs));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
    localByMethod[sale.paymentMethod] += amount;
    productsByMethod[sale.paymentMethod] += amount;
  }
  return {
    ...summary,
    localByMethod,
    productsByMethod,
    counterSalesTotal: total,
    localPending: summary.localPending + total,
    shopNetEstimate: summary.shopNetEstimate + total,
  };
}

/** Suma los productos de mostrador al barbero que los cargó. El abono no se atribuye a nadie. */
export function applyCounterSalesToBarberSummaries(
  byBarber: WeeklyBarberSummary[],
  sales: { totalArs: number; subscriptionAmountArs?: number | null; createdByName?: string | null }[]
): WeeklyBarberSummary[] {
  const rows = byBarber.map((barber) => ({ ...barber, productsSold: barber.productsSold ?? 0 }));
  let unmatched = 0;
  for (const sale of sales) {
    const total = Math.round(Number(sale.totalArs));
    const subscription = Math.max(0, Math.round(Number(sale.subscriptionAmountArs) || 0));
    const amount = Math.max(0, (Number.isFinite(total) ? total : 0) - subscription);
    if (amount <= 0) continue;
    const name = sale.createdByName?.trim().toLocaleLowerCase('es');
    const match = name
      ? rows.find((barber) => barber.barberName.trim().toLocaleLowerCase('es') === name)
      : undefined;
    if (match) match.productsSold += amount;
    else unmatched += amount;
  }
  if (unmatched > 0) {
    rows.push({
      barberKey: 'counter',
      barberName: 'Mostrador',
      appointments: 0,
      serviceGross: 0,
      productsSold: unmatched,
      depositsMp: 0,
      localPending: 0,
      commission: 0,
      afipInvoiced: 0,
      tips: 0,
    });
  }
  return rows;
}

export function shiftWeekAnchor(anchor: Date, deltaWeeks: number): Date {
  return deltaWeeks >= 0 ? addWeeks(anchor, deltaWeeks) : subWeeks(anchor, Math.abs(deltaWeeks));
}

export function shiftPeriodAnchor(
  anchor: Date,
  mode: CashClosePeriodMode,
  delta: number
): Date {
  if (mode === 'day') return shiftDayAnchor(anchor, delta);
  if (mode === 'month') return shiftMonthAnchor(anchor, delta);
  return shiftWeekAnchor(anchor, delta);
}

/** Valor para input type="month" (yyyy-MM). */
export function monthInputValueFromAnchor(anchor: Date): string {
  return format(anchor, 'yyyy-MM');
}
