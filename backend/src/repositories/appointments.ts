import pool, { query } from '../db.js';
import type { Appointment } from '../types.js';
import { getBarberById } from './barbers.js';

interface DbAppointment {
  id: number;
  name: string;
  phone: string;
  service: string;
  barber: string | null;
  barber_id: string | null;
  date: string;
  time: string;
}

function rowToAppointment(row: DbAppointment): Appointment {
  return {
    id: String(row.id),
    name: row.name,
    phone: row.phone,
    service: row.service,
    barber: row.barber ?? undefined,
    barberId: row.barber_id ?? undefined,
    date: row.date,
    time: row.time,
  };
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

export async function createAppointment(data: Omit<Appointment, 'id'>): Promise<Appointment> {
  let barberName = data.barber ?? null;
  if (!barberName && data.barberId) {
    const barber = await getBarberById(data.barberId);
    barberName = barber?.name ?? null;
  }
  const [res] = await pool.execute(
    `INSERT INTO appointments (name, phone, service, barber, barber_id, date, time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.phone,
      data.service,
      barberName,
      data.barberId ?? null,
      data.date,
      data.time,
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
  await query(
    `UPDATE appointments SET name = ?, phone = ?, service = ?, barber = ?, barber_id = ?, date = ?, time = ?
     WHERE id = ?`,
    [
      updated.name,
      updated.phone,
      updated.service,
      updated.barber ?? null,
      updated.barberId ?? null,
      updated.date,
      updated.time,
      id,
    ]
  );
  return getAppointmentById(id);
}

export async function deleteAppointment(id: string): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM appointments WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

const TIME_SLOTS = [
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30',
];

export async function getAvailableSlots(date: string, barberId: string): Promise<string[]> {
  const appointments = await getAppointmentsByBarber(barberId, date);
  const taken = appointments.map((a) => a.time);
  return TIME_SLOTS.filter((t) => !taken.includes(t));
}
