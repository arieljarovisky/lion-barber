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

function buildAppointmentCreatedMessage(app: Appointment): string {
  return [
    'Nuevo turno agendado',
    '',
    `Cliente: ${app.name}`,
    `Servicio: ${app.service}`,
    `Barbero: ${app.barber ?? app.barberId ?? '-'}`,
    `Fecha: ${fmtDate(app.date)}`,
    `Hora: ${app.time}`,
    `Telefono: ${app.phone}`,
    `Seña: ${app.depositPaid ? 'Pagada' : 'No pagada'}`,
  ].join('\n');
}

export async function notifyShopPhoneAppointmentCreated(app: Appointment): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text: buildAppointmentCreatedMessage(app),
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[Telegram] sendMessage HTTP ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.error('[Telegram] Error enviando notificación de turno', err);
  }
}
