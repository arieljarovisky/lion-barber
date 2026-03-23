import pool, { query } from '../db.js';
import { timeToMinutes, BUSINESS_OPEN_MINUTES, BUSINESS_CLOSE_MINUTES } from '../slotUtils.js';
import { isoWeekdayFromDateString } from '../weekdayUtils.js';

export interface BarberFranco {
  id: number;
  barberId: string;
  weekday: number;
}

export interface BarberTimeBlock {
  id: number;
  barberId: string;
  blockDate: string | null;
  weekday: number | null;
  timeStart: string;
  timeEnd: string;
}

interface DbFranco {
  id: number;
  barber_id: string;
  weekday: number;
}

interface DbBlock {
  id: number;
  barber_id: string;
  block_date: string | null;
  weekday: number | null;
  time_start: string;
  time_end: string;
}

function rowFranco(r: DbFranco): BarberFranco {
  return { id: r.id, barberId: r.barber_id, weekday: r.weekday };
}

function rowBlock(r: DbBlock): BarberTimeBlock {
  return {
    id: r.id,
    barberId: r.barber_id,
    blockDate: r.block_date,
    weekday: r.weekday,
    timeStart: r.time_start,
    timeEnd: r.time_end,
  };
}

export async function listFrancos(barberId: string): Promise<BarberFranco[]> {
  const rows = await query<DbFranco[]>(
    'SELECT id, barber_id, weekday FROM barber_francos WHERE barber_id = ? ORDER BY weekday',
    [barberId]
  );
  return rows.map(rowFranco);
}

export async function addFranco(barberId: string, weekday: number): Promise<BarberFranco> {
  const [res] = await pool.execute('INSERT INTO barber_francos (barber_id, weekday) VALUES (?, ?)', [
    barberId,
    weekday,
  ]);
  const insertId = (res as { insertId: number }).insertId;
  const rows = await query<DbFranco[]>('SELECT id, barber_id, weekday FROM barber_francos WHERE id = ?', [
    insertId,
  ]);
  const row = rows[0];
  if (!row) throw new Error('Franco no creado');
  return rowFranco(row);
}

export async function deleteFranco(id: number): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM barber_francos WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

export async function deleteFrancoForBarber(francoId: number, barberId: string): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM barber_francos WHERE id = ? AND barber_id = ?', [
    francoId,
    barberId,
  ]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

export async function listBlocks(barberId: string): Promise<BarberTimeBlock[]> {
  const rows = await query<DbBlock[]>(
    'SELECT id, barber_id, block_date, weekday, time_start, time_end FROM barber_time_blocks WHERE barber_id = ? ORDER BY block_date, weekday, time_start',
    [barberId]
  );
  return rows.map(rowBlock);
}

export async function addTimeBlock(
  barberId: string,
  data: {
    blockDate: string | null;
    weekday: number | null;
    timeStart: string;
    timeEnd: string;
  }
): Promise<BarberTimeBlock> {
  const [res] = await pool.execute(
    'INSERT INTO barber_time_blocks (barber_id, block_date, weekday, time_start, time_end) VALUES (?, ?, ?, ?, ?)',
    [barberId, data.blockDate, data.weekday, data.timeStart, data.timeEnd]
  );
  const insertId = (res as { insertId: number }).insertId;
  const rows = await query<DbBlock[]>(
    'SELECT id, barber_id, block_date, weekday, time_start, time_end FROM barber_time_blocks WHERE id = ?',
    [insertId]
  );
  const row = rows[0];
  if (!row) throw new Error('Bloque no creado');
  return rowBlock(row);
}

export async function deleteTimeBlock(id: number): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM barber_time_blocks WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

export async function deleteTimeBlockForBarber(blockId: number, barberId: string): Promise<boolean> {
  const [res] = await pool.execute('DELETE FROM barber_time_blocks WHERE id = ? AND barber_id = ?', [
    blockId,
    barberId,
  ]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

/**
 * Intervalos no disponibles por franco fijo o bloqueos de horario (sin citas).
 */
export async function getScheduleRestrictionIntervals(
  barberId: string,
  dateStr: string
): Promise<{ startMin: number; endMin: number }[]> {
  const intervals: { startMin: number; endMin: number }[] = [];
  const dow = isoWeekdayFromDateString(dateStr);

  const francos = await listFrancos(barberId);
  if (francos.some((f) => f.weekday === dow)) {
    intervals.push({ startMin: BUSINESS_OPEN_MINUTES, endMin: BUSINESS_CLOSE_MINUTES });
  }

  const blocks = await listBlocks(barberId);
  for (const b of blocks) {
    if (b.blockDate && b.blockDate === dateStr) {
      intervals.push({
        startMin: timeToMinutes(b.timeStart),
        endMin: timeToMinutes(b.timeEnd),
      });
      continue;
    }
    if (!b.blockDate && b.weekday != null && b.weekday === dow) {
      intervals.push({
        startMin: timeToMinutes(b.timeStart),
        endMin: timeToMinutes(b.timeEnd),
      });
    }
  }

  return intervals;
}
