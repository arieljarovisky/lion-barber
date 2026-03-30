import pool, { query } from '../db.js';

export interface ShopSettingsRow {
  cutoff_hours: number;
  open_weekdays: string;
  deposit_percent: number;
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

export async function getShopSettings(): Promise<{ cutoffHours: number; openWeekdays: number[]; depositPercent: number }> {
  const rows = await query<ShopSettingsRow[]>(
    'SELECT cutoff_hours, open_weekdays, deposit_percent FROM shop_settings WHERE id = 1'
  );
  const row = rows[0];
  if (!row) {
    return { cutoffHours: 12, openWeekdays: [1, 2, 3, 4, 5, 6, 7], depositPercent: 30 };
  }
  return {
    cutoffHours: row.cutoff_hours,
    openWeekdays: parseOpenWeekdays(row.open_weekdays),
    depositPercent:
      Number.isFinite(Number(row.deposit_percent)) && Number(row.deposit_percent) >= 0
        ? Math.min(100, Math.max(0, Number(row.deposit_percent)))
        : 30,
  };
}

export async function updateShopSettings(data: {
  cutoffHours?: number;
  openWeekdays?: number[];
  depositPercent?: number;
}): Promise<{ cutoffHours: number; openWeekdays: number[]; depositPercent: number }> {
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
  const openStr = openWeekdays.join(',');
  await pool.execute('UPDATE shop_settings SET cutoff_hours = ?, open_weekdays = ?, deposit_percent = ? WHERE id = 1', [
    cutoffHours,
    openStr,
    depositPercent,
  ]);
  return { cutoffHours, openWeekdays, depositPercent };
}
