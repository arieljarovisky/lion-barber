import pool, { query } from '../db.js';
import type { AfipInvoiceDetail, Appointment, AppointmentStatus } from '../types.js';
import * as userRepo from './users.js';
import { getBarberById, getAllBarbers } from './barbers.js';
import { getServiceById } from './services.js';
import {
  TIME_SLOTS,
  timeToMinutes,
  openTimeToMinutes,
  closeTimeToMinutes,
  slotFitsBusinessHours,
  intervalOverlapsExisting,
} from '../slotUtils.js';
import { getScheduleRestrictionIntervals } from './barberSchedule.js';
import { getShopSettings } from './shopSettings.js';
import { isDateOnOpenWeekday } from '../appointmentRules.js';

export const ANY_BARBER_ID = '__any__';

/** DATE/TIME desde MySQL: con dateStrings suelen ser string; sin dateStrings pueden ser Date. */
function rowDateToYmd(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function rowTimeToHHmm(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    const s = v.trim();
    return s.length >= 5 ? s.slice(0, 5) : s;
  }
  return String(v);
}

interface DbAppointment {
  id: number;
  user_id: number | null;
  name: string;
  phone: string;
  service: string;
  barber: string | null;
  barber_id: string | null;
  date: string | Date;
  time: string | Date;
  duration_minutes: number;
  service_id: string | null;
  deposit_paid: number;
  mercadopago_payment_id?: string | null;
  payment_due_at?: string | null;
  status?: string | null;
  afip_cae?: string | null;
  afip_cae_vto?: string | null;
  afip_cbte_nro?: number | null;
  afip_pto_vta?: number | null;
  afip_facturado_at?: string | null;
  afip_invoice_detail?: string | null;
}

function parseAfipDetail(raw: string | null | undefined): AfipInvoiceDetail | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  try {
    const o = JSON.parse(raw) as AfipInvoiceDetail;
    if (o && typeof o === 'object' && typeof o.total === 'number') return o;
  } catch {
    /* ignore */
  }
  return undefined;
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
    date: rowDateToYmd(row.date),
    time: rowTimeToHHmm(row.time),
    durationMinutes: row.duration_minutes ?? 30,
    depositPaid: Boolean(row.deposit_paid),
    mercadopagoPaymentId: row.mercadopago_payment_id ?? undefined,
    paymentDueAt: row.payment_due_at ?? undefined,
    status: st,
    afipCae: row.afip_cae ?? undefined,
    afipCaeVto: row.afip_cae_vto ? String(row.afip_cae_vto).slice(0, 10) : undefined,
    afipCbteNro: row.afip_cbte_nro != null ? Number(row.afip_cbte_nro) : undefined,
    afipPtoVta: row.afip_pto_vta != null ? Number(row.afip_pto_vta) : undefined,
    afipFacturadoAt: row.afip_facturado_at ?? undefined,
    afipInvoiceDetail: parseAfipDetail(row.afip_invoice_detail),
  };
}

export async function expireStalePendingAppointments(): Promise<void> {
  await query(
    "UPDATE appointments SET status = 'cancelled' WHERE status = 'pending_payment' AND payment_due_at IS NOT NULL AND payment_due_at < NOW()"
  );
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
  await expireStalePendingAppointments();
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
  blocked: { startMin: number; endMin: number }[],
  openMinutes?: number,
  closeMinutes?: number
): boolean {
  if (!TIME_SLOTS.includes(time)) return false;
  if (openMinutes != null && timeToMinutes(time) < openMinutes) return false;
  if (!slotFitsBusinessHours(time, durationMinutes, closeMinutes)) return false;
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
  excludeAppointmentId?: string,
  openMinutes?: number,
  closeMinutes?: number
): Promise<void> {
  const blocked = await getBlockedIntervalsForBarber(barberId, date);
  if (excludeAppointmentId) {
    const apps = await getAppointmentsByBarber(barberId, date);
    const filtered = apps.filter((a) => a.id !== excludeAppointmentId);
    const intervals = appointmentIntervalsForDay(filtered);
    if (!isSlotFreeForBarber(barberId, date, time, durationMinutes, intervals, openMinutes, closeMinutes)) {
      throw new Error('Ese horario ya está ocupado o se solapa con otro turno');
    }
    return;
  }
  if (!isSlotFreeForBarber(barberId, date, time, durationMinutes, blocked, openMinutes, closeMinutes)) {
    throw new Error('Ese horario ya está ocupado o se solapa con otro turno');
  }
}

export async function resolveBarberForAny(
  date: string,
  time: string,
  durationMinutes: number
): Promise<string | null> {
  const { openWeekdays, closeTime, weekdayHours } = await getShopSettings();
  if (!isDateOnOpenWeekday(date, openWeekdays)) return null;
  const weekday = new Date(`${date}T12:00:00`).getDay() || 7;
  const dayHours = weekdayHours[weekday] ?? { openTime: '10:00', closeTime };
  const openMinutes = openTimeToMinutes(dayHours.openTime);
  const closeMinutes = closeTimeToMinutes(dayHours.closeTime);
  const barbers = await getAllBarbers();
  const ordered = barbers.sort((a, b) => a.id.localeCompare(b.id));
  for (const b of ordered) {
    const blocked = await getBlockedIntervalsForBarber(b.id, date);
    if (isSlotFreeForBarber(b.id, date, time, durationMinutes, blocked, openMinutes, closeMinutes)) {
      return b.id;
    }
  }
  return null;
}

export async function getAllAppointments(): Promise<Appointment[]> {
  await expireStalePendingAppointments();
  const rows = await query<DbAppointment[]>('SELECT * FROM appointments ORDER BY date, time');
  return rows.map(rowToAppointment);
}

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  await expireStalePendingAppointments();
  const rows = await query<DbAppointment[]>(
    'SELECT * FROM appointments WHERE date = ? ORDER BY time',
    [date]
  );
  return rows.map(rowToAppointment);
}

export async function getAppointmentsByUserId(userId: number): Promise<Appointment[]> {
  await expireStalePendingAppointments();
  const rows = await query<DbAppointment[]>(
    'SELECT * FROM appointments WHERE user_id = ? ORDER BY date DESC, time DESC',
    [userId]
  );
  return rows.map(rowToAppointment);
}

/** Historial por usuario (panel admin). */
export async function getAppointmentsByUserIds(userIds: number[]): Promise<Map<number, Appointment[]>> {
  const map = new Map<number, Appointment[]>();
  for (const id of userIds) map.set(id, []);
  if (userIds.length === 0) return map;
  await expireStalePendingAppointments();
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await query<DbAppointment[]>(
    `SELECT * FROM appointments WHERE user_id IN (${placeholders}) ORDER BY user_id, date DESC, time DESC`,
    userIds
  );
  for (const row of rows) {
    const uid = row.user_id;
    if (uid == null) continue;
    const list = map.get(uid);
    if (list) list.push(rowToAppointment(row));
  }
  return map;
}

export async function getAppointmentsByBarber(barberId: string, date?: string): Promise<Appointment[]> {
  await expireStalePendingAppointments();
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
  await expireStalePendingAppointments();
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
  const { openWeekdays, closeTime, weekdayHours } = await getShopSettings();
  if (!isDateOnOpenWeekday(date, openWeekdays)) return [];
  const weekday = new Date(`${date}T12:00:00`).getDay() || 7;
  const dayHours = weekdayHours[weekday] ?? { openTime: '10:00', closeTime };
  const openMinutes = openTimeToMinutes(dayHours.openTime);
  const closeMinutes = closeTimeToMinutes(dayHours.closeTime);
  const blocked = await getBlockedIntervalsForBarber(barberId, date);
  return TIME_SLOTS.filter((t) =>
    isSlotFreeForBarber(barberId, date, t, durationMinutes, blocked, openMinutes, closeMinutes)
  );
}

/** Horarios en los que al menos un barbero puede atender (misma duración). */
export async function getAvailableSlotsAnyBarber(date: string, durationMinutes: number): Promise<string[]> {
  const { openWeekdays, closeTime, weekdayHours } = await getShopSettings();
  if (!isDateOnOpenWeekday(date, openWeekdays)) return [];
  const weekday = new Date(`${date}T12:00:00`).getDay() || 7;
  const dayHours = weekdayHours[weekday] ?? { openTime: '10:00', closeTime };
  const openMinutes = openTimeToMinutes(dayHours.openTime);
  const closeMinutes = closeTimeToMinutes(dayHours.closeTime);
  const barbers = await getAllBarbers();
  const union = new Set<string>();
  for (const b of barbers) {
    const blocked = await getBlockedIntervalsForBarber(b.id, date);
    const slots = TIME_SLOTS.filter((t) =>
      isSlotFreeForBarber(b.id, date, t, durationMinutes, blocked, openMinutes, closeMinutes)
    );
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
  const { openWeekdays, closeTime, weekdayHours } = await getShopSettings();
  if (!isDateOnOpenWeekday(date, openWeekdays)) return null;
  const weekday = new Date(`${date}T12:00:00`).getDay() || 7;
  const dayHours = weekdayHours[weekday] ?? { openTime: '10:00', closeTime };
  const openMinutes = openTimeToMinutes(dayHours.openTime);
  const closeMinutes = closeTimeToMinutes(dayHours.closeTime);
  const barbers = await getAllBarbers();
  const orderedBarbers = [...barbers].sort((a, b) => a.id.localeCompare(b.id));
  for (const t of TIME_SLOTS) {
    for (const b of orderedBarbers) {
      const blocked = await getBlockedIntervalsForBarber(b.id, date);
      if (isSlotFreeForBarber(b.id, date, t, durationMinutes, blocked, openMinutes, closeMinutes)) {
        return { barberId: b.id, time: t };
      }
    }
  }
  return null;
}

export async function createAppointment(data: Omit<Appointment, 'id'>): Promise<Appointment> {
  await expireStalePendingAppointments();
  let barberId = data.barberId;
  const durationMinutes = data.durationMinutes ?? (await resolveDurationMinutes(data.serviceId, data.service));
  const { closeTime, weekdayHours } = await getShopSettings();
  const weekday = new Date(`${data.date}T12:00:00`).getDay() || 7;
  const dayHours = weekdayHours[weekday] ?? { openTime: '10:00', closeTime };
  const openMinutes = openTimeToMinutes(dayHours.openTime);
  const closeMinutes = closeTimeToMinutes(dayHours.closeTime);

  if (barberId === ANY_BARBER_ID || !barberId) {
    if (!data.date || !data.time) throw new Error('Fecha y hora requeridas');
    const resolved = await resolveBarberForAny(data.date, data.time, durationMinutes);
    if (!resolved) throw new Error('No hay barbero disponible en ese horario');
    barberId = resolved;
  }

  await assertNoOverlap(barberId!, data.date, data.time, durationMinutes, undefined, openMinutes, closeMinutes);

  let barberName = data.barber ?? null;
  if (!barberName && barberId) {
    const barber = await getBarberById(barberId);
    barberName = barber?.name ?? null;
  }

  const serviceId = data.serviceId ?? null;
  const depositPaid = data.depositPaid ? 1 : 0;
  const mpId = data.mercadopagoPaymentId ?? null;
  const status = data.status ?? 'scheduled';
  const paymentDueAt = data.paymentDueAt ?? null;

  const [res] = await pool.execute(
    `INSERT INTO appointments (user_id, name, phone, service, service_id, barber, barber_id, date, time, duration_minutes, deposit_paid, mercadopago_payment_id, status, payment_due_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      status,
      paymentDueAt,
    ]
  );
  const insertId = (res as { insertId: number }).insertId;
  const created = await getAppointmentById(String(insertId));
  if (!created) throw new Error('Appointment not created');
  const uid = data.userId;
  if (uid != null && Number.isFinite(Number(uid))) {
    const p = String(data.phone ?? '').trim();
    if (p.length > 0) {
      await userRepo.setClientPhone(Number(uid), p);
    }
  }
  return created;
}

export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment | null> {
  await expireStalePendingAppointments();
  const current = await getAppointmentById(id);
  if (!current) return null;
  const updated = { ...current, ...data };
  const barberId = updated.barberId ?? current.barberId;
  const date = updated.date ?? current.date;
  const time = updated.time ?? current.time;
  const serviceChanged =
    (data.serviceId != null && data.serviceId !== current.serviceId) ||
    (data.service != null && data.service !== current.service);
  const durationMinutes =
    data.durationMinutes != null
      ? Number(data.durationMinutes)
      : serviceChanged
        ? await resolveDurationMinutes(updated.serviceId, updated.service)
        : current.durationMinutes ?? 30;
  const { closeTime, weekdayHours } = await getShopSettings();
  const weekday = new Date(`${date}T12:00:00`).getDay() || 7;
  const dayHours = weekdayHours[weekday] ?? { openTime: '10:00', closeTime };
  const openMinutes = openTimeToMinutes(dayHours.openTime);
  const closeMinutes = closeTimeToMinutes(dayHours.closeTime);

  if (barberId && date && time) {
    await assertNoOverlap(barberId, date, time, durationMinutes, id, openMinutes, closeMinutes);
  }

  let barberName = updated.barber;
  if (data.barberId && !barberName) {
    const barber = await getBarberById(data.barberId);
    barberName = barber?.name ?? updated.barber;
  }

  await query(
    `UPDATE appointments SET name = ?, phone = ?, service = ?, service_id = ?, barber = ?, barber_id = ?, date = ?, time = ?, duration_minutes = ?, deposit_paid = ?, status = ?, payment_due_at = ?
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
      updated.status ?? 'scheduled',
      updated.paymentDueAt ?? null,
      id,
    ]
  );
  const saved = await getAppointmentById(id);
  if (saved && saved.userId != null) {
    const p = String(saved.phone ?? '').trim();
    await userRepo.setClientPhone(saved.userId, p);
  }
  return saved;
}

export async function markAppointmentPaidAndScheduled(
  appointmentId: string,
  paymentId: string
): Promise<Appointment | null> {
  await query(
    "UPDATE appointments SET status = 'scheduled', deposit_paid = 1, mercadopago_payment_id = ?, payment_due_at = NULL WHERE id = ? AND status != 'cancelled'",
    [paymentId, appointmentId]
  );
  return getAppointmentById(appointmentId);
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

export async function setAppointmentAfipInvoice(
  id: string,
  data: {
    cae: string;
    caeVto: string;
    cbteNro: number;
    ptoVta: number;
    invoiceDetail?: AfipInvoiceDetail;
  }
): Promise<void> {
  const detailJson = data.invoiceDetail ? JSON.stringify(data.invoiceDetail) : null;
  await pool.execute(
    `UPDATE appointments SET afip_cae = ?, afip_cae_vto = ?, afip_cbte_nro = ?, afip_pto_vta = ?, afip_facturado_at = NOW(), afip_invoice_detail = ? WHERE id = ?`,
    [data.cae, data.caeVto, data.cbteNro, data.ptoVta, detailJson, id]
  );
}
