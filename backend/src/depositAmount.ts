import { DEPOSIT_PERCENT } from './constants/deposit.js';
import type { Appointment } from './types.js';
import { getServiceById } from './repositories/services.js';

function parseArsAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized = cleaned;
  if (hasDot && hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/\./g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function calculateDepositAmountArs(servicePriceArs: number, depositPercent: number): number {
  const raw = (servicePriceArs * depositPercent) / 100;
  return Math.max(1, Math.round(raw));
}

export async function resolveAppointmentServiceAmountArs(app: Appointment): Promise<number | null> {
  if (app.serviceId) {
    const s = await getServiceById(app.serviceId);
    if (s?.price) {
      const n = parseArsAmount(s.price);
      if (n != null && n > 0) return n;
    }
  }
  return parseArsAmount(app.service);
}

/** Seña: monto real de MP si está guardado; si no, estimado al % configurado. */
export async function resolveAppointmentDepositAmountArs(app: Appointment): Promise<number> {
  if (!app.depositPaid) return 0;
  if (app.depositAmountArs != null && app.depositAmountArs > 0) {
    return app.depositAmountArs;
  }
  const serviceAmount = await resolveAppointmentServiceAmountArs(app);
  if (serviceAmount == null || serviceAmount <= 0) return 0;
  return calculateDepositAmountArs(serviceAmount, DEPOSIT_PERCENT);
}
