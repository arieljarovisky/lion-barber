import pool, { query } from '../db.js';
import type { Appointment, AppointmentStatus } from '../types.js';
import { getBarberById, getAllBarbers } from './barbers.js';
import { getServiceById } from './services.js';
import {
  TIME_SLOTS,
  timeToMinutes,
  slotFitsBusinessHours,
  intervalOverlapsExisting,
} from '../slotUtils.js';
import { getScheduleRestrictionIntervals } from './barberSchedule.js';
import { getShopSettings } from './shopSettings.js';
import { isDateOnOpenWeekday } from '../appointmentRules.js';

export const ANY_BARBER_ID = '__any__';

interface DbAppointment {
  id: number;
  user_id: number | null;
  name: string;
  phone: string;
  service: string;
  barber: string | null;
  barber_id: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  service_id: string | null;
  deposit_paid: number;
  mercadopago_payment_id?: string | null;
  status?: string | null;
}

function rowToAppointment(row: DbAppointment): Appointment {
  const st = (row.status as AppointmentStatus | undefined) ?? 'scheduled';
  return {
    id: String(row.id),
    userId: row.user_id ?? undefined,
    name: row.name,
    phone: row.phone,
    service: row.service,
    serviceId: row.service_id ?? undefined,
    barber: row.barber ?? undefined,
    barberId: row.barber_id ?? undefined,
    date: row.date,
    time: row.time,
    durationMinutes: row.duration_minutes ?? 30,
    depositPaid: Boolean(row.deposit_paid),
    mercadopagoPaymentId: row.mercadopago_payment_id ?? undefined,
    status: st,
  };
}

function appointmentIntervalsForDay(appointments: Appointment[]): { startMin: number; endMin: number }[] {
  return appointments.map((a) => {
    const d = a.durationMinutes ?? 30;
    const startMin = timeToMinutes(a.time);
    return { startMin, endMin: startMin + d };
  });
}

export async function getBlockedIntervalsForBarber(
  barberId: string,
  date: string
): Promise<{ startMin: number; endMin: number }[]> {
  const apps = (await getAppointmentsByBarber(barberId, date)).filter(
    (a) => (a.status ?? 'scheduled') !== 'cancelled'
  );
  const fromApps = appointmentIntervalsForDay(apps);
  const fromSchedule = await getScheduleRestrictionIntervals(barberId, date);
  return [...fromApps, ...fromSchedule];
}

export function isSlotFreeForBarber(
  barberId: string,
  date: string,
  time: string,
  durationMinutes: number,
  blocked: { startMin: number; endMin: number }[]
): boolean {
  if (!TIME_SLOTS.includes(time)) return false;
  if (!slotFitsBusinessHours(time, durationMinutes)) return false;
  const startMin = timeToMinutes(time);
  const endMin = startMin + durationMinutes;
  return !intervalOverlapsExisting(startMin, endMin, blocked);
}

/** Comprueba solapamiento antes de crear o mover un turno. */
export async function assertNoOverlap(
  barberId: string,
  date: string,
  time: string,
  durationMinutes: number,
  excludeAppointmentId?: string
): Promise<void> {
  const blocked = await getBlockedIntervalsForBarber(barberId, date);
  if (excludeAppointmentId) {
    const apps = await getAppointmentsByBarber(barberId, date);
    const filtered = apps.filter((a) => a.id !== excludeAppointmentId);
    const intervals = appointmentIntervalsForDay(filtered);
    if (!isSlotFreeForBarber(barberId, date, time, durationMinutes, intervals)) {
      throw new Error('Ese horario ya está ocupado o se solapa con otro turno');
    }
    return;
  }
  if (!isSlotFreeForBarber(barberId, date, time, durationMinutes, blocked)) {
    throw new Error('Ese horario ya está ocupado o se solapa con otro turno');
  }
}

export async function resolveBarberForAny(
  date: string,
  time: string,
  durationMinutes: number
): Promise<string | null> {
  const { openWeekdays } = await getShopSettings();
  if (!isDateOnOpenWeekday(date, openWeekdays)) return null;
  const barbers = await getAllBarbers();
  const ordered = barbers.sort((a, b) => a.id.localeCompare(b.id));
  for (const b of ordered) {
    const blocked = await getBlockedIntervalsForBarber(b.id, date);
    if (isSlotFreeForBarber(b.id, date, time, durationMinutes, blocked)) {
      return b.id;
    }
  }
  return null;
}

export async function getAllAppointments(): Promise<Appointment[]> {
  const rows = await query<DbAppointment[]>('SELECT * FROM appointments ORDER BY date, time');
  return rows.map(rowToAppointment);
}

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  const rows = await query<DbAppointment[]>(
    'SELECT * FROM appointments WHERE date = ? ORDER BY time',
    [date]
  );
  return rows.map(rowToAppointment);
}

export async function getAppointmentsByUserId(userId: number): Promise<Appointment[]> {
  const rows = await query<DbAppointment[]>(
    'SELECT * FROM appointments WHERE user_id = ? ORDER BY date DESC, time DESC',
    [userId]
  );
  return rows.map(rowToAppointment);
}

export async function getAppointmentsByBarber(barberId: string, date?: string): Promise<Appointment[]> {
  let sql = 'SELECT * FROM appointments WHERE barber_id = ?';
  const params: unknown[] = [barberId];
  if (date) {
    sql += ' AND date = ?';
    params.push(date);
  }
  sql += ' ORDER BY time';
  const rows = await query<DbAppointment[]>(sql, params);
  return rows.map(rowToAppointment);
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  const rows = await query<DbAppointment[]>('SELECT * FROM appointments WHERE id = ?', [id]);
  const row = rows[0];
  return row ? rowToAppointment(row) : null;
}

export async function getAppointmentByMercadopagoPaymentId(
  paymentId: string
): Promise<Appointment | null> {
  const rows = await query<DbAppointment[]>(
    'SELECT * FROM appointments WHERE mercadopago_payment_id = ? LIMIT 1',
    [paymentId]
  );
  const row = rows[0];
  return row ? rowToAppointment(row) : null;
}

export async function resolveDurationMinutes(
  serviceId: string | undefined,
  serviceName: string
): Promise<number> {
  if (serviceId) {
    const s = await getServiceById(serviceId);
    if (s) return s.duration;
  }
  const rows = await query<{ duration: number }[]>(
    'SELECT duration FROM services WHERE name = ? LIMIT 1',
    [serviceName]
  );
  if (rows[0]) return rows[0].duration;
  return 30;
}

export async function getAvailableSlots(date: string, barberId: string, durationMinutes = 30): Promise<string[]> {
  const { openWeekdays } = await getShopSettings();
  if (!isDateOnOpenWeekday(date, openWeekdays)) return [];
  const blocked = await getBlockedIntervalsForBarber(barberId, date);
  return TIME_SLOTS.filter((t) => isSlotFreeForBarber(barberId, date, t, durationMinutes, blocked));
}

/** Horarios en los que al menos un barbero puede atender (misma duración). */
export async function getAvailableSlotsAnyBarber(date: string, durationMinutes: number): Promise<string[]> {
  const { openWeekdays } = await getShopSettings();
  if (!isDateOnOpenWeekday(date, openWeekdays)) return [];
  const barbers = await getAllBarbers();
  const union = new Set<string>();
  for (const b of barbers) {
    const slots = await getAvailableSlots(date, b.id, durationMinutes);
    for (const s of slots) union.add(s);
  }
  return TIME_SLOTS.filter((t) => union.has(t));
}

export interface EarliestSlot {
  barberId: string;
  time: string;
}

/** Primer hueco disponible entre todos los barberos (hora más temprana; barbero estable por id). */
export async function getEarliestAvailableAnyBarber(
  date: string,
  durationMinutes: number
): Promise<EarliestSlot | null> {
  const { openWeekdays } = await getShopSettings();
  if (!isDateOnOpenWeekday(date, openWeekdays)) return null;
  const barbers = await getAllBarbers();
  const orderedBarbers = [...barbers].sort((a, b) => a.id.localeCompare(b.id));
  for (const t of TIME_SLOTS) {
    for (const b of orderedBarbers) {
      const blocked = await getBlockedIntervalsForBarber(b.id, date);
      if (isSlotFreeForBarber(b.id, date, t, durationMinutes, blocked)) {
        return { barberId: b.id, time: t };
      }
    }
  }
  return null;
}

export async function createAppointment(data: Omit<Appointment, 'id'>): Promise<Appointment> {
  let barberId = data.barberId;
  const durationMinutes = data.durationMinutes ?? (await resolveDurationMinutes(data.serviceId, data.service));

  if (barberId === ANY_BARBER_ID || !barberId) {
    if (!data.date || !data.time) throw new Error('Fecha y hora requeridas');
    const resolved = await resolveBarberForAny(data.date, data.time, durationMinutes);
    if (!resolved) throw new Error('No hay barbero disponible en ese horario');
    barberId = resolved;
  }

  await assertNoOverlap(barberId!, data.date, data.time, durationMinutes);

  let barberName = data.barber ?? null;
  if (!barberName && barberId) {
    const barber = await getBarberById(barberId);
    barberName = barber?.name ?? null;
  }

  const serviceId = data.serviceId ?? null;
  const depositPaid = data.depositPaid ? 1 : 0;
  const mpId = data.mercadopagoPaymentId ?? null;

  const [res] = await pool.execute(
    `INSERT INTO appointments (user_id, name, phone, service, service_id, barber, barber_id, date, time, duration_minutes, deposit_paid, mercadopago_payment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.userId ?? null,
      data.name,
      data.phone,
      data.service,
      serviceId,
      barberName,
      barberId ?? null,
      data.date,
      data.time,
      durationMinutes,
      depositPaid,
      mpId,
    ]
  );
  const insertId = (res as { insertId: number }).insertId;
  const created = await getAppointmentById(String(insertId));
  if (!created) throw new Error('Appointment not created');
  return created;
}

export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment | null> {
  const current = await getAppointmentById(id);
  if (!current) return null;
  const updated = { ...current, ...data };
  const barberId = updated.barberId ?? current.barberId;
  const date = updated.date ?? current.date;
  const time = updated.time ?? current.time;
  const durationMinutes = updated.durationMinutes ?? current.durationMinutes ?? 30;

  if (barberId && date && time) {
    await assertNoOverlap(barberId, date, time, durationMinutes, id);
  }

  let barberName = updated.barber;
  if (data.barberId && !barberName) {
    const barber = await getBarberById(data.barberId);
    barberName = barber?.name ?? updated.barber;
  }

  await query(
    `UPDATE appointments SET name = ?, phone = ?, service = ?, service_id = ?, barber = ?, barber_id = ?, date = ?, time = ?, duration_minutes = ?, deposit_paid = ?
     WHERE id = ?`,
    [
      updated.name,
      updated.phone,
      updated.service,
      updated.serviceId ?? null,
      barberName ?? null,
      updated.barberId ?? null,
      updated.date,
      updated.time,
      durationMinutes,
      updated.depositPaid ? 1 : 0,
      id,
    ]
  );
  return getAppointmentById(id);
}

/** Cancelación por el cliente (soft). */
export async function cancelAppointmentByUser(id: string, userId: number): Promise<Appointment | null> {
  const app = await getAppointmentById(id);
  if (!app || app.userId !== userId) return null;
  if (app.status === 'cancelled') return app;
  await pool.execute(`UPDATE appointments SET status = 'cancelled' WHERE id = ? AND user_id = ?`, [id, userId]);
  return getAppointmentById(id);
}

export async function deleteAppointment(id: string): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM appointments WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}
