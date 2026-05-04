const AR_TZ = 'America/Argentina/Buenos_Aires';

/**
 * Formatea un instante (ISO con Z u offset, o legacy `YYYY-MM-DD HH:mm:ss` interpretado como UTC)
 * para mostrar fecha y hora en Argentina.
 */
export function formatInstantInArgentina(raw: string): string {
  const t = raw.trim();
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(t.replace(' ', 'T'))) {
    d = new Date(t.replace(' ', 'T') + 'Z');
  } else {
    d = new Date(t);
  }
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}
