/**
 * Convención: columnas DATETIME como `afip_facturado_at` guardan el instante en **UTC** (wall clock UTC, sin offset en el string).
 * Así coincide con servidores MySQL en UTC (p. ej. Railway) y el cliente puede formatear en Argentina.
 */

export function mysqlDatetimeUtcNaiveFromDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Expone a la API como ISO 8601 con Z para que JSON no sea ambiguo. */
export function mysqlUtcNaiveToIsoInstant(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  const s = typeof v === 'string' ? v.trim() : String(v);
  if (!s) return undefined;
  if (s.includes('T') && (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s))) return s;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,3})?$/.exec(s);
  if (!m) return s;
  return `${m[1]}T${m[2]}${m[3] ?? ''}Z`;
}
