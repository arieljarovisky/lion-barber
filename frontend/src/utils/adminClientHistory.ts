import { addDays, differenceInCalendarDays, format, parse, startOfDay } from 'date-fns';
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

export type ClientVisitFrequency = {
  visitCount: number;
  /** Días promedio entre visitas. Null si hay menos de dos. */
  averageDays: number | null;
  /** Texto corto: «cada 3 semanas». */
  label: string;
  detail: string;
  lastVisitYmd: string | null;
  /** Fecha estimada de la próxima visita, si ya hay frecuencia. */
  nextVisitYmd: string | null;
};

function parseAppointmentDay(ymd: string | undefined): Date | null {
  const clean = ymd?.slice(0, 10) ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const d = parse(clean, 'yyyy-MM-dd', new Date());
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function formatFrequencyLabel(averageDays: number): string {
  const days = Math.max(1, Math.round(averageDays));
  if (days === 1) return 'Casi todos los días';
  if (days < 6) return `Cada ${days} días`;
  const weeks = Math.round(days / 7);
  if (weeks <= 8) {
    if (weeks <= 1) return 'Cada semana';
    return `Cada ${weeks} semanas`;
  }
  const months = Math.max(1, Math.round(days / 30.44));
  if (months === 1) return 'Cada mes';
  return `Cada ${months} meses`;
}

/**
 * Frecuencia con la que el cliente viene: turnos confirmados con fecha de hoy o anterior.
 * Varios turnos el mismo día cuentan como una sola visita.
 */
export function clientVisitFrequency(
  appointments: Appointment[],
  now = new Date()
): ClientVisitFrequency {
  const today = startOfDay(now);
  const byDay = new Map<string, Date>();
  for (const app of appointments) {
    if (app.status === 'cancelled' || app.status === 'pending_payment') continue;
    const day = parseAppointmentDay(app.date);
    if (!day || day > today) continue;
    byDay.set(format(day, 'yyyy-MM-dd'), day);
  }
  const visits = [...byDay.values()].sort((a, b) => a.getTime() - b.getTime());

  if (visits.length === 0) {
    return {
      visitCount: 0,
      averageDays: null,
      label: 'Sin visitas',
      detail: 'No hay turnos confirmados ya realizados.',
      lastVisitYmd: null,
      nextVisitYmd: null,
    };
  }

  const last = visits[visits.length - 1]!;
  const lastVisitYmd = format(last, 'yyyy-MM-dd');
  if (visits.length === 1) {
    return {
      visitCount: 1,
      averageDays: null,
      label: 'Una sola visita',
      detail: 'Hace falta al menos otra visita para calcular la frecuencia.',
      lastVisitYmd,
      nextVisitYmd: null,
    };
  }

  let sum = 0;
  for (let i = 1; i < visits.length; i++) {
    sum += differenceInCalendarDays(visits[i]!, visits[i - 1]!);
  }
  const averageDays = sum / (visits.length - 1);
  const rounded = Math.max(1, Math.round(averageDays));
  return {
    visitCount: visits.length,
    averageDays,
    label: formatFrequencyLabel(averageDays),
    detail: `Promedio de ${rounded} día${rounded === 1 ? '' : 's'} entre visitas`,
    lastVisitYmd,
    nextVisitYmd: format(addDays(last, rounded), 'yyyy-MM-dd'),
  };
}

export type ClientPreferredBarber = {
  name: string | null;
  visits: number;
  detail: string;
};

/**
 * Barbero con más turnos confirmados ya realizados.
 * Si hay empate, queda el de la visita más reciente.
 */
export function clientPreferredBarber(
  appointments: Appointment[],
  now = new Date()
): ClientPreferredBarber {
  const today = startOfDay(now);
  const counts = new Map<string, { name: string; visits: number; last: number }>();
  for (const app of appointments) {
    if (app.status === 'cancelled' || app.status === 'pending_payment') continue;
    const day = parseAppointmentDay(app.date);
    if (!day || day > today) continue;
    const name = app.barber?.trim();
    if (!name) continue;
    const key = (app.barberId?.trim() || name).toLowerCase();
    const prev = counts.get(key);
    if (!prev) {
      counts.set(key, { name, visits: 1, last: day.getTime() });
      continue;
    }
    prev.visits += 1;
    if (day.getTime() > prev.last) prev.last = day.getTime();
  }

  const ranked = [...counts.values()].sort((a, b) => b.visits - a.visits || b.last - a.last);
  const top = ranked[0];
  if (!top) {
    return {
      name: null,
      visits: 0,
      detail: 'Todavía no hay turnos con barbero asignado.',
    };
  }
  const total = ranked.reduce((n, row) => n + row.visits, 0);
  const tied = ranked.filter((row) => row.visits === top.visits).length > 1;
  return {
    name: top.name,
    visits: top.visits,
    detail: tied
      ? `Empate en ${top.visits} visita${top.visits === 1 ? '' : 's'}. Se muestra el de la última visita.`
      : `${top.visits} de ${total} visita${total === 1 ? '' : 's'}`,
  };
}
