/**
 * Convierte fechas/horas leídas de MySQL con `dateStrings: true` a ISO-8601 en UTC (`...Z`).
 *
 * Sin sufijo de zona, `parseISO` en el front las trata como hora local y se desfasan ~3 h
 * respecto a Argentina cuando el servidor/MySQL trabaja en UTC.
 */
export function dbDateTimeToIsoUtc(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return String(value);
  const s = value.trim();
  if (!s) return '';
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : s;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?))?$/);
  if (!m) return s;
  const datePart = m[1];
  const timePart = m[2] ?? '00:00:00';
  const d = new Date(`${datePart}T${timePart}Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : s;
}
