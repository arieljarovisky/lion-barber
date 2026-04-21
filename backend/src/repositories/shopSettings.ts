import pool, { query } from '../db.js';

export interface ShopSettingsRow {
  cutoff_hours: number;
  open_weekdays: string;
  deposit_percent: number;
  close_time: string;
}

const DEFAULT_OPEN = '1,2,3,4,5,6,7';

export function parseOpenWeekdays(raw: string): number[] {
  const s = (raw || DEFAULT_OPEN).trim();
  if (!s) return [1, 2, 3, 4, 5, 6, 7];
  return s
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => n >= 1 && n <= 7);
}

function normalizeCloseTime(raw: string | undefined): string {
  const s = (raw ?? '').trim();
  const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return '20:00';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 10) return '10:00';
  if (hh > 23) return '23:00';
  const aligned = mm < 30 ? '00' : '30';
  return `${String(hh).padStart(2, '0')}:${aligned}`;
}

export async function getShopSettings(): Promise<{
  cutoffHours: number;
  openWeekdays: number[];
  depositPercent: number;
  closeTime: string;
}> {
  const rows = await query<ShopSettingsRow[]>(
    'SELECT cutoff_hours, open_weekdays, deposit_percent, close_time FROM shop_settings WHERE id = 1'
  );
  const row = rows[0];
  if (!row) {
    return { cutoffHours: 12, openWeekdays: [1, 2, 3, 4, 5, 6, 7], depositPercent: 30, closeTime: '20:00' };
  }
  return {
    cutoffHours: row.cutoff_hours,
    openWeekdays: parseOpenWeekdays(row.open_weekdays),
    depositPercent:
      Number.isFinite(Number(row.deposit_percent)) && Number(row.deposit_percent) >= 0
        ? Math.min(100, Math.max(0, Number(row.deposit_percent)))
        : 30,
    closeTime: normalizeCloseTime(row.close_time),
  };
}

export async function updateShopSettings(data: {
  cutoffHours?: number;
  openWeekdays?: number[];
  depositPercent?: number;
  closeTime?: string;
}): Promise<{ cutoffHours: number; openWeekdays: number[]; depositPercent: number; closeTime: string }> {
  const current = await getShopSettings();
  const cutoffHours =
    data.cutoffHours != null && Number.isFinite(data.cutoffHours) && data.cutoffHours >= 0
      ? Math.min(168, Math.max(0, Math.floor(Number(data.cutoffHours))))
      : current.cutoffHours;
  let openWeekdays = current.openWeekdays;
  if (data.openWeekdays != null && Array.isArray(data.openWeekdays)) {
    const uniq = [...new Set(data.openWeekdays.filter((n) => n >= 1 && n <= 7))].sort((a, b) => a - b);
    openWeekdays = uniq.length > 0 ? uniq : [1, 2, 3, 4, 5, 6, 7];
  }
  const depositPercent =
    data.depositPercent != null && Number.isFinite(data.depositPercent) && data.depositPercent >= 0
      ? Math.min(100, Math.max(0, Number(data.depositPercent)))
      : current.depositPercent;
  const closeTime = data.closeTime != null ? normalizeCloseTime(String(data.closeTime)) : current.closeTime;
  const openStr = openWeekdays.join(',');
  await pool.execute(
    'UPDATE shop_settings SET cutoff_hours = ?, open_weekdays = ?, deposit_percent = ?, close_time = ? WHERE id = 1',
    [cutoffHours, openStr, depositPercent, closeTime]
  );
  return { cutoffHours, openWeekdays, depositPercent, closeTime };
}
