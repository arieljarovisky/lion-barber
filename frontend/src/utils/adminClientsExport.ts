import * as XLSX from 'xlsx';
import type { AdminClientWithHistory, Appointment } from '../api';
import { displayClientEmail, isPlaceholderManualClientEmail } from './manualClientEmail';

const AR_TZ = 'America/Argentina/Buenos_Aires';

const HEADERS = [
  'Nombre',
  'Email',
  'Teléfonos',
  'Puntos',
  'Saldo cuenta (ARS)',
  'Exento de seña',
  'Abono',
  'Cortes usados',
  'Cortes restantes',
  'Vigencia abono',
  'Notas',
  'Fecha de alta',
  'Turnos',
  'Último turno',
  'Estado último turno',
  'Cuenta Google',
] as const;

function todayYmdArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(new Date());
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

function clientPhones(c: AdminClientWithHistory): string[] {
  if (Array.isArray(c.phones) && c.phones.length > 0) {
    return c.phones.map((p) => p.trim()).filter(Boolean);
  }
  if (c.phone?.trim()) return [c.phone.trim()];
  return [];
}

function appointmentStatusLabel(status: Appointment['status']): string {
  if (status === 'cancelled') return 'Cancelado';
  if (status === 'pending_payment') return 'Pendiente de pago';
  if (status === 'scheduled') return 'Confirmado';
  return status ?? '';
}

function latestAppointment(appointments: Appointment[]): Appointment | null {
  if (appointments.length === 0) return null;
  return [...appointments].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return (b.time ?? '').localeCompare(a.time ?? '');
  })[0];
}

function subscriptionValidity(c: AdminClientWithHistory): string {
  const sub = c.subscription;
  if (!sub) return '';
  const start = sub.periodStart?.slice(0, 10) ?? '';
  const end = sub.periodEnd?.slice(0, 10) ?? '';
  if (start && end) return `${start} a ${end}`;
  return start || end;
}

function clientRow(c: AdminClientWithHistory): (string | number)[] {
  const last = latestAppointment(c.appointments);
  const email = isPlaceholderManualClientEmail(c.email) ? '' : displayClientEmail(c.email);
  return [
    c.name,
    email,
    clientPhones(c).join('; '),
    c.points,
    c.accountBalanceArs ?? 0,
    c.depositExempt ? 'Sí' : 'No',
    c.subscription?.planName ?? '',
    c.subscription ? c.subscription.cutsUsed : '',
    c.subscription ? c.subscription.cutsRemaining : '',
    subscriptionValidity(c),
    c.adminNotes?.trim() ?? '',
    formatCreatedAt(c.createdAt),
    c.appointments.length,
    last ? `${last.date}${last.time ? ` ${last.time}` : ''}` : '',
    last ? appointmentStatusLabel(last.status) : '',
    c.hasGoogleAccount ? 'Sí' : 'No',
  ];
}

/** Descarga un .xlsx con la ficha de todos los clientes cargados. */
export function exportAdminClientsExcel(clients: AdminClientWithHistory[]): void {
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const rows: (string | number)[][] = [Array.from(HEADERS), ...sorted.map(clientRow)];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 28 },
    { wch: 32 },
    { wch: 24 },
    { wch: 10 },
    { wch: 20 },
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 24 },
    { wch: 40 },
    { wch: 20 },
    { wch: 10 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
  ];
  if (rows.length > 1) {
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(HEADERS.length - 1)}${rows.length}` };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, `clientes_${todayYmdArgentina()}.xlsx`);
}
