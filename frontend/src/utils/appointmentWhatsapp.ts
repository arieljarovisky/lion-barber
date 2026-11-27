import type { Appointment } from '../api';
import { normalizePhoneDigits } from './adminClientLookup';
import { applyWhatsappMessageTemplate } from './whatsappAppointmentMessage';

function buildWhatsappPhone(rawPhone: string): string | null {
  const digits = normalizePhoneDigits(rawPhone);
  if (digits.length < 8) return null;
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('15')) return `549${digits.slice(2)}`;
  if (digits.length >= 10) return `549${digits}`;
  return `549${digits}`;
}

export function appointmentNeedsManualContact(app: Appointment): boolean {
  if (app.status === 'cancelled') return false;
  return normalizePhoneDigits(app.phone ?? '').length >= 8;
}

export function buildAppointmentWhatsappUrl(
  app: Appointment,
  messageTemplate: string | null
): string | null {
  const phone = buildWhatsappPhone(app.phone ?? '');
  if (!phone) return null;
  const body = applyWhatsappMessageTemplate(messageTemplate, app);
  return `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
}

export const DEFAULT_DELAY_MESSAGE = 'Hola {nombre}, disculpá la demora. Estamos {minutos} minutos demorados. ¡Ya te atendemos!';

export const DELAY_MESSAGE_HELP = 'Variables: {nombre}, {nombre_completo}, {minutos}. Formato WhatsApp: *negrita* _cursiva_.';

export function buildDelayWhatsappUrl(
  app: Appointment,
  delayMinutes: number,
  template?: string | null
): string | null {
  const phone = buildWhatsappPhone(app.phone ?? '');
  if (!phone) return null;
  const clientName = (app.name ?? '').trim().split(/\s+/)[0] || 'Cliente';
  const fullName = (app.name ?? '').trim() || clientName;
  const tpl = (template ?? '').trim() || DEFAULT_DELAY_MESSAGE;
  const body = tpl
    .replace(/{nombre}/g, clientName)
    .replace(/{nombre_completo}/g, fullName)
    .replace(/{minutos}/g, String(delayMinutes));
  return `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
}
