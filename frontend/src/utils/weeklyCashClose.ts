import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  parseISO,
  isWithinInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { Appointment, Barber, Service, ServicePaymentMethod } from '../api';
import { calculateDepositAmountArs, resolveAppointmentServiceAmountArs } from './money';
import { SERVICE_PAYMENT_METHODS, applySplitsToMethodTotals } from './servicePaymentMethod';
import type { ServicePaymentSplit } from '../api';

/** Semana de cierre: lunes a domingo (Argentina). */
export const WEEK_OPTS = { weekStartsOn: 1 as const, locale: es };

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
  serviceName: string;
  barberKey: string;
  barberName: string;
  serviceAmount: number;
  depositAmount: number;
  depositPaid: boolean;
  localPending: number;
  commissionPercent: number;
  commissionAmount: number;
  afipTotal: number | null;
  afipInvoiced: boolean;
  status: string;
  servicePaymentMethod: ServicePaymentMethod | null;
  servicePaymentSplits: ServicePaymentSplit[] | null;
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
  depositsMp: number;
  localPending: number;
  commission: number;
  afipInvoiced: number;
};

export type WeeklyCashSummary = {
  appointments: number;
  cancelledInWeek: number;
  serviceGross: number;
  depositsMp: number;
  localPending: number;
  commissions: number;
  shopNetEstimate: number;
  afipInvoicedTotal: number;
  afipInvoicedCount: number;
  pendingAfipCount: number;
  /** Saldo en local agrupado por método registrado (sin método → unregistered). */
  localByMethod: PaymentMethodTotals;
  /** Señas MP (siempre mercadopago en depósitos). */
  depositsMpByMethod: PaymentMethodTotals;
};

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
      commissionPercent: b?.commissionPercent ?? 0,
    };
  }
  const name = app.barber ?? 'Sin barbero';
  return { key: `name:${name}`, name, commissionPercent: 0 };
}

function afipAmountForAppointment(app: Appointment, fallbackService: number): number | null {
  if (!app.afipCae) return null;
  const detail = app.afipInvoiceDetail;
  if (detail && typeof detail.total === 'number' && detail.total > 0) return detail.total;
  return fallbackService > 0 ? fallbackService : null;
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
    const { key, name, commissionPercent } = resolveBarber(app, barbers);
    const depositAmount =
      app.depositPaid && serviceAmount > 0
        ? calculateDepositAmountArs(serviceAmount, depositPercent)
        : 0;
    const localPending = Math.max(0, serviceAmount - depositAmount);
    const commissionAmount =
      serviceAmount > 0 && commissionPercent > 0
        ? Math.round((serviceAmount * commissionPercent) / 100)
        : 0;
    const afipTotal = afipAmountForAppointment(app, serviceAmount);

    rows.push({
      appointmentId: app.id,
      date: d,
      time: app.time,
      clientName: app.name,
      serviceName: app.service,
      barberKey: key,
      barberName: name,
      serviceAmount,
      depositAmount,
      depositPaid: Boolean(app.depositPaid),
      localPending,
      commissionPercent,
      commissionAmount,
      afipTotal,
      afipInvoiced: Boolean(app.afipCae),
      status: app.status ?? 'scheduled',
      servicePaymentMethod: app.servicePaymentMethod ?? null,
      servicePaymentSplits: app.servicePaymentSplits ?? null,
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
        depositsMp: 0,
        localPending: 0,
        commission: 0,
        afipInvoiced: 0,
      };
      byBarberMap.set(r.barberKey, b);
    }
    b.appointments += 1;
    b.serviceGross += r.serviceAmount;
    b.depositsMp += r.depositAmount;
    b.localPending += r.localPending;
    b.commission += r.commissionAmount;
    if (r.afipTotal != null) b.afipInvoiced += r.afipTotal;
  }

  const byBarber = [...byBarberMap.values()].sort((a, b) =>
    a.barberName.localeCompare(b.barberName, 'es', { sensitivity: 'base' })
  );

  const summary: WeeklyCashSummary = rows.reduce(
    (acc, r) => {
      acc.appointments += 1;
      acc.serviceGross += r.serviceAmount;
      acc.depositsMp += r.depositAmount;
      acc.localPending += r.localPending;
      acc.commissions += r.commissionAmount;
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
      shopNetEstimate: 0,
      afipInvoicedTotal: 0,
      afipInvoicedCount: 0,
      pendingAfipCount: 0,
      localByMethod: emptyPaymentMethodTotals(),
      depositsMpByMethod: emptyPaymentMethodTotals(),
    }
  );
  summary.shopNetEstimate = summary.serviceGross - summary.commissions;

  return { rows, byBarber, summary };
}

export function shiftWeekAnchor(anchor: Date, deltaWeeks: number): Date {
  return deltaWeeks >= 0 ? addWeeks(anchor, deltaWeeks) : subWeeks(anchor, Math.abs(deltaWeeks));
}
