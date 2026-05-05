import type { Appointment } from '../types.js';
import { getBarberById } from '../repositories/barbers.js';

function getTwilioConfig():
  | { accountSid: string; authToken: string; fromNumber: string }
  | null {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID ?? '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN ?? '').trim();
  const fromNumber = (process.env.TWILIO_WHATSAPP_FROM ?? '').trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function buildAppointmentPaidMessage(app: Appointment): string {
  return [
    'Nuevo turno con seña confirmada',
    '',
    `Cliente: ${app.name}`,
    `Servicio: ${app.service}`,
    `Fecha: ${fmtDate(app.date)}`,
    `Hora: ${app.time}`,
    `Telefono cliente: ${app.phone}`,
  ].join('\n');
}

export async function notifyBarberByWhatsappOnDepositPaid(app: Appointment): Promise<void> {
  try {
    const cfg = getTwilioConfig();
    if (!cfg) return;
    const barberId = app.barberId?.trim();
    if (!barberId) return;

    const barber = await getBarberById(barberId);
    const to = barber?.whatsappPhone?.trim();
    if (!to) return;

    const body = new URLSearchParams();
    body.set('From', `whatsapp:${cfg.fromNumber}`);
    body.set('To', `whatsapp:${to}`);
    body.set('Body', buildAppointmentPaidMessage(app));

    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(
        `[WhatsApp] Twilio devolvió ${res.status} al notificar turno ${app.id}: ${errText}`
      );
    }
  } catch (err) {
    console.error('[WhatsApp] Error enviando notificación al barbero', err);
  }
}
