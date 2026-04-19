import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Appointment } from '../api';

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

export function getAdminAppointmentPaymentBadge(app: Appointment): { label: string; className: string } {
  if (app.status === 'pending_payment') {
    return {
      label: 'Pago pendiente',
      className: 'bg-amber-100 text-amber-900 border border-amber-300',
    };
  }
  if (app.depositPaid) {
    return {
      label: 'Seña pagada',
      className: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    };
  }
  return {
    label: 'Sin seña',
    className: 'bg-zinc-100 text-zinc-700 border border-zinc-200',
  };
}
