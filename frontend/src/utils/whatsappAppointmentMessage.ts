import type { Appointment } from '../api';

const SHOP_DISPLAY_NAME = 'LION BARBER';
const TOLERANCE_MINUTES = 10;

const FOOTER_SITE_URL =
  (import.meta.env.VITE_WHATSAPP_FOOTER_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() ||
  'www.lionbarber.com.ar';

export const WHATSAPP_TEMPLATE_HELP = `Variables: {nombre}, {nombre_completo}, {cuando}, {fecha}, {hora}, {servicio}, {barbero}, {pie_tolerancia}, {pie_sistema}.
Formato WhatsApp: *negrita*  _cursiva_. Si dejás vacío, se usa el mensaje automático de ${SHOP_DISPLAY_NAME}.`;

export const WHATSAPP_TEMPLATE_PLACEHOLDER = `Hola *{nombre_completo}*. {cuando} hs. tenés un turno reservado con *{barbero}* en *${SHOP_DISPLAY_NAME}*.

{pie_tolerancia}

{pie_sistema}`;

function todayYmdArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatAppointmentDateForMessage(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

/** "Hoy a las 17:20" o "El 23/05/2026 a las 17:20" (sin "hs." — va después en la frase). */
export function buildCuandoPhrase(date: string, time: string): string {
  const hhmm = time.trim().slice(0, 5);
  if (date === todayYmdArgentina()) {
    return `Hoy a las ${hhmm}`;
  }
  return `El ${formatAppointmentDateForMessage(date)} a las ${hhmm}`;
}

function pieToleranciaLine(): string {
  return `Tolerancia para el turno de ${TOLERANCE_MINUTES} minutos`;
}

function pieSistemaLine(): string {
  return `_Mensaje automático_ ${FOOTER_SITE_URL}`;
}

function replaceTemplateVars(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

function defaultWhatsappBody(app: Appointment): string {
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Cliente';
  const fullName = ((app.name ?? '').trim() || greetingName).toLocaleUpperCase('es-AR');
  const barbero = ((app.barber ?? '').trim() || 'tu barbero').toLocaleUpperCase('es-AR');
  const cuando = buildCuandoPhrase(app.date, app.time);

  return [
    `Hola *${fullName}*. ${cuando} hs. tenés un turno reservado con *${barbero}* en *${SHOP_DISPLAY_NAME}*.`,
    '',
    pieToleranciaLine(),
    '',
    pieSistemaLine(),
  ].join('\n');
}

export function applyWhatsappMessageTemplate(
  template: string | null | undefined,
  app: Appointment
): string {
  const t = (template ?? '').trim();
  if (!t) return defaultWhatsappBody(app);

  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Cliente';
  const fullName = (app.name ?? '').trim() || greetingName;
  const fecha = formatAppointmentDateForMessage(app.date);
  const hora = app.time;
  const servicio = app.service;
  const barbero = (app.barber ?? '').trim();

  return replaceTemplateVars(t, {
    nombre: greetingName,
    nombre_completo: fullName,
    cuando: buildCuandoPhrase(app.date, app.time),
    fecha,
    hora,
    servicio,
    barbero,
    pie_tolerancia: pieToleranciaLine(),
    pie_sistema: pieSistemaLine(),
  });
}
