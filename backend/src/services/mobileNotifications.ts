import type { Appointment } from '../types.js';

function getTelegramConfig(): { botToken: string; chatId: string } | null {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function formatBarberLine(app: Appointment): string {
  const assigned = app.barber ?? app.barberId ?? '-';
  if (app.clientChoseAnyBarber) {
    return `Barbero: Sin preferencia (asignado: ${assigned})`;
  }
  return `Barbero: ${assigned}`;
}

function appointmentBaseLines(app: Appointment): string[] {
  return [
    `Cliente: ${app.name}`,
    `Servicio: ${app.service}`,
    formatBarberLine(app),
    `Fecha: ${fmtDate(app.date)}`,
    `Hora: ${app.time}`,
    `Telefono: ${app.phone}`,
  ];
}

function buildAppointmentCreatedMessage(app: Appointment): string {
  return [
    'Nuevo turno agendado',
    '',
    ...appointmentBaseLines(app),
    `Seña: ${app.depositPaid ? 'Pagada' : 'No pagada'}`,
  ].join('\n');
}

function buildAppointmentCancelledMessage(
  app: Appointment,
  opts?: { byClient?: boolean }
): string {
  const header = opts?.byClient
    ? 'Turno cancelado por el cliente'
    : 'Turno cancelado';
  return [header, '', ...appointmentBaseLines(app)].join('\n');
}

function buildAppointmentRescheduledMessage(prev: Appointment, next: Appointment): string {
  return [
    'Turno reprogramado por el cliente',
    '',
    `Cliente: ${next.name}`,
    `Servicio: ${next.service}`,
    formatBarberLine(next),
    `Antes: ${fmtDate(prev.date)} ${prev.time}`,
    `Ahora: ${fmtDate(next.date)} ${next.time}`,
    `Telefono: ${next.phone}`,
  ].join('\n');
}

async function sendTelegramMessage(text: string): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[Telegram] sendMessage HTTP ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.error('[Telegram] Error enviando notificación', err);
  }
}

export async function notifyShopPhoneAppointmentCreated(app: Appointment): Promise<void> {
  await sendTelegramMessage(buildAppointmentCreatedMessage(app));
}

export async function notifyShopPhoneAppointmentCancelled(
  app: Appointment,
  opts?: { byClient?: boolean }
): Promise<void> {
  await sendTelegramMessage(buildAppointmentCancelledMessage(app, opts));
}

export async function notifyShopPhoneAppointmentRescheduled(
  prev: Appointment,
  next: Appointment
): Promise<void> {
  await sendTelegramMessage(buildAppointmentRescheduledMessage(prev, next));
}
