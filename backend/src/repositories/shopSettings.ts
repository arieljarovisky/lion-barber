import pool, { query } from '../db.js';

export interface ShopSettingsRow {
  cutoff_hours: number;
  open_weekdays: string;
  deposit_percent: number;
  close_time: string;
  weekday_hours?: string | null;
  closed_dates?: string | null;
  whatsapp_message_template?: string | null;
}

const DEFAULT_OPEN = '1,2,3,4,5,6,7';
const DEFAULT_OPEN_TIME = '10:00';
const DEFAULT_CLOSE_TIME = '20:00';

export interface DayHours {
  openTime: string;
  closeTime: string;
}

export type WeekdayHours = Record<number, DayHours>;

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

function normalizeTime20(raw: string | undefined, fallback: string): string {
  const s = (raw ?? '').trim();
  const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return fallback;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const aligned = mm < 20 ? '00' : mm < 40 ? '20' : '40';
  return `${String(hh).padStart(2, '0')}:${aligned}`;
}

function defaultWeekdayHours(): WeekdayHours {
  return {
    1: { openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME },
    2: { openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME },
    3: { openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME },
    4: { openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME },
    5: { openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME },
    6: { openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME },
    7: { openTime: DEFAULT_OPEN_TIME, closeTime: DEFAULT_CLOSE_TIME },
  };
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function normalizeDayHours(input: Partial<DayHours> | undefined, fallback: DayHours): DayHours {
  const openTime = normalizeTime20(input?.openTime, fallback.openTime);
  let closeTime = normalizeTime20(input?.closeTime, fallback.closeTime);
  if (timeToMinutes(closeTime) <= timeToMinutes(openTime)) {
    const closeMin = Math.min(timeToMinutes(openTime) + 20, 24 * 60);
    const hh = String(Math.floor(closeMin / 60)).padStart(2, '0');
    const mm = String(closeMin % 60).padStart(2, '0');
    closeTime = `${hh}:${mm}`;
  }
  return { openTime, closeTime };
}

function parseWeekdayHours(raw: string | null | undefined, fallbackClose: string): WeekdayHours {
  const base = defaultWeekdayHours();
  // Mantener compatibilidad con el cierre global existente.
  for (let d = 1; d <= 7; d++) base[d] = { openTime: DEFAULT_OPEN_TIME, closeTime: fallbackClose };
  if (!raw?.trim()) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<DayHours>>;
    for (let d = 1; d <= 7; d++) {
      base[d] = normalizeDayHours(parsed[String(d)], base[d]);
    }
    return base;
  } catch {
    return base;
  }
}

function parseClosedDates(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const unique = new Set<string>();
    for (const v of parsed) {
      const s = String(v ?? '').trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) unique.add(s);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function getShopSettings(): Promise<{
  cutoffHours: number;
  openWeekdays: number[];
  depositPercent: number;
  closeTime: string;
  weekdayHours: WeekdayHours;
  closedDates: string[];
  whatsappMessageTemplate: string | null;
}> {
  const rows = await query<ShopSettingsRow[]>(
    'SELECT cutoff_hours, open_weekdays, deposit_percent, close_time, weekday_hours, closed_dates, whatsapp_message_template FROM shop_settings WHERE id = 1'
  );
  const row = rows[0];
  if (!row) {
    return {
      cutoffHours: 12,
      openWeekdays: [1, 2, 3, 4, 5, 6, 7],
      depositPercent: 30,
      closeTime: '20:00',
      weekdayHours: defaultWeekdayHours(),
      closedDates: [],
      whatsappMessageTemplate: null,
    };
  }
  const closeTime = normalizeCloseTime(row.close_time);
  const tpl = row.whatsapp_message_template;
  const whatsappMessageTemplate =
    typeof tpl === 'string' && tpl.trim().length > 0 ? tpl.trim().slice(0, 8000) : null;
  return {
    cutoffHours: row.cutoff_hours,
    openWeekdays: parseOpenWeekdays(row.open_weekdays),
    depositPercent:
      Number.isFinite(Number(row.deposit_percent)) && Number(row.deposit_percent) >= 0
        ? Math.min(100, Math.max(0, Number(row.deposit_percent)))
        : 30,
    closeTime,
    weekdayHours: parseWeekdayHours(row.weekday_hours, closeTime),
    closedDates: parseClosedDates(row.closed_dates),
    whatsappMessageTemplate,
  };
}

export async function updateShopSettings(data: {
  cutoffHours?: number;
  openWeekdays?: number[];
  depositPercent?: number;
  closeTime?: string;
  weekdayHours?: Partial<Record<number, Partial<DayHours>>>;
  closedDates?: string[];
  whatsappMessageTemplate?: string | null;
}): Promise<{
  cutoffHours: number;
  openWeekdays: number[];
  depositPercent: number;
  closeTime: string;
  weekdayHours: WeekdayHours;
  closedDates: string[];
  whatsappMessageTemplate: string | null;
}> {
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
  const weekdayHours = { ...current.weekdayHours };
  if (data.weekdayHours && typeof data.weekdayHours === 'object') {
    for (let d = 1; d <= 7; d++) {
      weekdayHours[d] = normalizeDayHours(data.weekdayHours[d], weekdayHours[d]);
    }
  }
  let closedDates = current.closedDates;
  if (data.closedDates != null && Array.isArray(data.closedDates)) {
    const unique = new Set<string>();
    for (const raw of data.closedDates) {
      const s = String(raw ?? '').trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) unique.add(s);
    }
    closedDates = Array.from(unique).sort((a, b) => a.localeCompare(b));
  }
  let whatsappMessageTemplate = current.whatsappMessageTemplate;
  if (Object.prototype.hasOwnProperty.call(data, 'whatsappMessageTemplate')) {
    const raw = data.whatsappMessageTemplate;
    if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
      whatsappMessageTemplate = null;
    } else if (typeof raw === 'string') {
      whatsappMessageTemplate = raw.trim().slice(0, 8000);
    }
  }
  const openStr = openWeekdays.join(',');
  await pool.execute(
    'UPDATE shop_settings SET cutoff_hours = ?, open_weekdays = ?, deposit_percent = ?, close_time = ?, weekday_hours = ?, closed_dates = ?, whatsapp_message_template = ? WHERE id = 1',
    [
      cutoffHours,
      openStr,
      depositPercent,
      closeTime,
      JSON.stringify(weekdayHours),
      JSON.stringify(closedDates),
      whatsappMessageTemplate,
    ]
  );
  return { cutoffHours, openWeekdays, depositPercent, closeTime, weekdayHours, closedDates, whatsappMessageTemplate };
}
