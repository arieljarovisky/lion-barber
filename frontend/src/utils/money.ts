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

/** Parsea importe ARS con signo (negativo = debe plata). */
export function parseSignedArsInput(raw: string): number | 'invalid' {
  let t = raw.trim().replace(/\s/g, '');
  if (!t || t === '-') return 0;
  const neg = t.startsWith('-');
  if (neg) t = t.slice(1);
  if (!t) return 0;

  const hasDot = t.includes('.');
  const hasComma = t.includes(',');
  let normalized = t;
  if (hasDot && hasComma) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = t.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = t.replace(/\./g, '');
    }
  } else if (hasComma) {
    const parts = t.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = t.replace(/,/g, '');
    } else {
      normalized = t.replace(',', '.');
    }
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return 'invalid';
  const signed = neg ? -n : n;
  return Math.round(signed * 100) / 100;
}

/** Deuda del cliente según saldo (solo si el saldo es negativo). */
export function clientAccountBalanceOwedArs(balance: number | null | undefined): number {
  if (balance == null || !Number.isFinite(balance) || balance >= 0) return 0;
  return Math.round(Math.abs(balance) * 100) / 100;
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
