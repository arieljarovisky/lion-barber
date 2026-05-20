import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Appointment } from '../api';

/** Teléfonos separados por coma, salto de línea o punto y coma. */
export function parsePhonesInput(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function formatPhonesForInput(phones: string[]): string {
  return phones.filter((p) => p.trim().length > 0).join('\n');
}

/** MySQL TIME → "HH:MM" para tablas admin. */
export function normalizeAppointmentTime(t: string | undefined): string {
  if (!t) return '';
  const s = t.trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function formatAppointmentDateYmd(ymd: string): string {
  const clean = ymd.slice(0, 10);
  try {
    return format(parse(clean, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy', { locale: es });
  } catch {
    return ymd;
  }
}

export function adminAppointmentStatusBadge(app: Appointment): { label: string; className: string } {
  if (app.status === 'cancelled') {
    return { label: 'Cancelado', className: 'bg-red-50 text-red-800 border-red-200' };
  }
  if (app.status === 'pending_payment') {
    return { label: 'Pago pendiente', className: 'bg-amber-50 text-amber-900 border-amber-200' };
  }
  return { label: 'Programado', className: 'bg-emerald-50 text-emerald-900 border-emerald-200' };
}

export { getAppointmentPaymentBadgeInfo as getAdminAppointmentPaymentBadge } from '../components/AppointmentPaymentBadge';
