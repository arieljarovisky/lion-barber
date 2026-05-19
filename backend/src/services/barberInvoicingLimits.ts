import { getAllBarbers, getBarberById } from '../repositories/barbers.js';
import {
  getInvoicedTotalForBarberYear,
  getInvoicedTotalsByBarberYear,
} from '../repositories/barberInvoicing.js';

export type BarberInvoicingStatus = 'no_limit' | 'ok' | 'warning' | 'exceeded';

export interface BarberInvoicingUsage {
  barberId: string;
  barberName: string;
  year: number;
  monotributoCategory: string | null;
  annualLimit: number | null;
  invoicedTotal: number;
  remaining: number | null;
  percentUsed: number | null;
  status: BarberInvoicingStatus;
}

const WARNING_PERCENT = 90;

export function currentCalendarYearArgentina(): number {
  const y = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
  }).format(new Date());
  return parseInt(y, 10) || new Date().getFullYear();
}

function usageStatus(invoiced: number, limit: number | null | undefined): BarberInvoicingStatus {
  if (limit == null || limit <= 0) return 'no_limit';
  const pct = (invoiced / limit) * 100;
  if (pct >= 100) return 'exceeded';
  if (pct >= WARNING_PERCENT) return 'warning';
  return 'ok';
}

export async function buildBarberInvoicingUsage(year: number): Promise<BarberInvoicingUsage[]> {
  const barbers = await getAllBarbers();
  const totals = await getInvoicedTotalsByBarberYear(year);
  return barbers.map((b) => {
    const invoicedTotal = totals.get(b.id) ?? 0;
    const annualLimit =
      b.monotributoAnnualLimit != null && b.monotributoAnnualLimit > 0
        ? b.monotributoAnnualLimit
        : null;
    const remaining = annualLimit != null ? Math.max(0, annualLimit - invoicedTotal) : null;
    const percentUsed =
      annualLimit != null && annualLimit > 0
        ? Math.round((invoicedTotal / annualLimit) * 1000) / 10
        : null;
    return {
      barberId: b.id,
      barberName: b.name,
      year,
      monotributoCategory: b.monotributoCategory ?? null,
      annualLimit,
      invoicedTotal,
      remaining,
      percentUsed,
      status: usageStatus(invoicedTotal, annualLimit),
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
  const limit = barber.monotributoAnnualLimit;
  if (limit == null || limit <= 0) return;

  const year = currentCalendarYearArgentina();
  const invoiced = await getInvoicedTotalForBarberYear(barberId, year);
  const projected = Math.round((invoiced + additionalAmount) * 100) / 100;

  if (projected > limit) {
    const cat = barber.monotributoCategory ? ` (${barber.monotributoCategory})` : '';
    throw new Error(
      `Límite de facturación ${year} para ${barber.name}${cat}: ya facturó $${invoiced.toLocaleString('es-AR')} y este comprobante suma $${additionalAmount.toLocaleString('es-AR')}. El tope anual es $${limit.toLocaleString('es-AR')}.`
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
