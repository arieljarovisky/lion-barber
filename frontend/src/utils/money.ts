import type { Appointment, Service } from '../api';

/** Parsea precio en ARS desde texto tipo catálogo (alineado con backend). */
export function parseArsAmount(raw: string | undefined): number | null {
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

export function formatArs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Misma lógica que el backend al crear la preferencia de seña en Mercado Pago. */
export function calculateDepositAmountArs(servicePriceArs: number, depositPercent: number): number {
  const raw = (servicePriceArs * depositPercent) / 100;
  const rounded = Math.round(raw);
  return Math.max(1, rounded);
}

/** Seña: monto real guardado de MP; si falta, estimado al % indicado. */
export function resolveAppointmentDepositAmountArs(
  app: Appointment,
  services: Service[],
  depositPercent: number
): number {
  if (!app.depositPaid) return 0;
  if (app.depositAmountArs != null && app.depositAmountArs > 0) {
    return app.depositAmountArs;
  }
  const serviceAmount = resolveAppointmentServiceAmountArs(app, services) ?? 0;
  if (serviceAmount <= 0) return 0;
  return calculateDepositAmountArs(serviceAmount, depositPercent);
}

/** Importe del servicio del turno según catálogo (misma lógica que AFIP en backend). */
export function resolveAppointmentServiceAmountArs(app: Appointment, services: Service[]): number | null {
  if (app.serviceId) {
    const s = services.find((x) => x.id === app.serviceId);
    if (s?.price) {
      const n = parseArsAmount(s.price);
      if (n != null && n > 0) return n;
    }
  }
  const byName = services.find((x) => x.name === app.service);
  if (byName?.price) {
    const n = parseArsAmount(byName.price);
    if (n != null && n > 0) return n;
  }
  return parseArsAmount(app.service);
}
