import { getAllBarbers, getBarberById } from '../repositories/barbers.js';
import {
  getInvoicedTotalForBarberMonth,
  getInvoicedTotalsByBarberMonth,
} from '../repositories/barberInvoicing.js';

export type BarberInvoicingStatus = 'no_limit' | 'ok' | 'warning' | 'exceeded';

export interface BarberInvoicingUsage {
  barberId: string;
  barberName: string;
  year: number;
  month: number;
  monotributoCategory: string | null;
  monthlyLimit: number | null;
  invoicedTotal: number;
  remaining: number | null;
  percentUsed: number | null;
  status: BarberInvoicingStatus;
}

const WARNING_PERCENT = 90;

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function formatMonthYearArgentina(year: number, month: number): string {
  const name = MONTH_NAMES_ES[month - 1] ?? String(month);
  return `${name} ${year}`;
}

export function currentCalendarYearArgentina(): number {
  return currentCalendarMonthArgentina().year;
}

export function currentCalendarMonthArgentina(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? '', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? '', 10);
  const now = new Date();
  return {
    year: Number.isFinite(year) ? year : now.getFullYear(),
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
  };
}

function usageStatus(invoiced: number, limit: number | null | undefined): BarberInvoicingStatus {
  if (limit == null || limit <= 0) return 'no_limit';
  const pct = (invoiced / limit) * 100;
  if (pct >= 100) return 'exceeded';
  if (pct >= WARNING_PERCENT) return 'warning';
  return 'ok';
}

export async function buildBarberInvoicingUsage(
  year: number,
  month: number
): Promise<BarberInvoicingUsage[]> {
  const barbers = await getAllBarbers();
  const totals = await getInvoicedTotalsByBarberMonth(year, month);
  return barbers.map((b) => {
    const invoicedTotal = totals.get(b.id) ?? 0;
    const monthlyLimit =
      b.monotributoMonthlyLimit != null && b.monotributoMonthlyLimit > 0
        ? b.monotributoMonthlyLimit
        : null;
    const remaining = monthlyLimit != null ? Math.max(0, monthlyLimit - invoicedTotal) : null;
    const percentUsed =
      monthlyLimit != null && monthlyLimit > 0
        ? Math.round((invoicedTotal / monthlyLimit) * 1000) / 10
        : null;
    return {
      barberId: b.id,
      barberName: b.name,
      year,
      month,
      monotributoCategory: b.monotributoCategory ?? null,
      monthlyLimit,
      invoicedTotal,
      remaining,
      percentUsed,
      status: usageStatus(invoicedTotal, monthlyLimit),
    };
  });
}

export async function assertBarberCanInvoice(
  barberId: string | null | undefined,
  additionalAmount: number
): Promise<void> {
  if (!barberId) {
    throw new Error(
      'El turno no tiene barbero asignado. Asignalo en la agenda antes de facturar para controlar el límite de monotributo.'
    );
  }
  const barber = await getBarberById(barberId);
  if (!barber) throw new Error('Barbero del turno no encontrado.');
  const limit = barber.monotributoMonthlyLimit;
  if (limit == null || limit <= 0) return;

  const { year, month } = currentCalendarMonthArgentina();
  const invoiced = await getInvoicedTotalForBarberMonth(barberId, year, month);
  const projected = Math.round((invoiced + additionalAmount) * 100) / 100;

  if (projected > limit) {
    const cat = barber.monotributoCategory ? ` (${barber.monotributoCategory})` : '';
    const period = formatMonthYearArgentina(year, month);
    throw new Error(
      `Límite de facturación de ${period} para ${barber.name}${cat}: ya facturó $${invoiced.toLocaleString('es-AR')} y este comprobante suma $${additionalAmount.toLocaleString('es-AR')}. El tope mensual es $${limit.toLocaleString('es-AR')}.`
    );
  }
}

export function getUsageForBarber(
  usageList: BarberInvoicingUsage[],
  barberId: string | null | undefined
): BarberInvoicingUsage | null {
  if (!barberId) return null;
  return usageList.find((u) => u.barberId === barberId) ?? null;
}
