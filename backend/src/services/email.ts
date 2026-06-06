import nodemailer, { type Transporter } from 'nodemailer';
import type { Appointment } from '../types.js';
import { PLACEHOLDER_EMAIL_HOST } from '../repositories/users.js';
import {
  getClientSubscriptionStatus,
  type ClientSubscriptionStatus,
} from './clientSubscription.js';

let cachedTransporter: Transporter | null = null;
let cachedTransporterKey = '';
let warnedMissingConfig = false;

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  shopName: string;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST ?? '').trim();
  const user = (process.env.SMTP_USER ?? '').trim();
  const password = (process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS ?? '').trim();
  if (!host || !user || !password) {
    if (!warnedMissingConfig) {
      console.warn(
        '[Email] SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASSWORD). No se enviarán emails al cliente.'
      );
      warnedMissingConfig = true;
    }
    return null;
  }
  const portRaw = (process.env.SMTP_PORT ?? '587').trim();
  const port = Number.parseInt(portRaw, 10) || 587;
  const secureRaw = (process.env.SMTP_SECURE ?? '').trim().toLowerCase();
  const secure = secureRaw === 'true' || secureRaw === '1' || port === 465;
  const from = (process.env.SMTP_FROM ?? '').trim() || user;
  const shopName = (process.env.SHOP_NAME ?? 'Lion Barber').trim() || 'Lion Barber';
  return { host, port, secure, user, password, from, shopName };
}

function getTransporter(cfg: SmtpConfig): Transporter {
  const key = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}`;
  if (cachedTransporter && cachedTransporterKey === key) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
  });
  cachedTransporterKey = key;
  return cachedTransporter;
}

/** Filtra emails placeholder (clientes manuales sin correo real). */
export function isRealClientEmail(email: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) {
    console.warn('[Email] Descartado: cliente sin email registrado');
    return false;
  }
  if (e.endsWith(`@${PLACEHOLDER_EMAIL_HOST.toLowerCase()}`)) {
    console.warn(`[Email] Descartado: email placeholder "${e}" (cliente manual sin correo real)`);
    return false;
  }
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  if (!valid) {
    console.warn(`[Email] Descartado: email con formato inválido "${e}"`);
  }
  return valid;
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAppointmentTable(app: Appointment): { text: string; html: string } {
  const rows: Array<[string, string]> = [
    ['Servicio', app.service],
    ['Barbero', app.barber ?? app.barberId ?? '-'],
    ['Fecha', fmtDate(app.date)],
    ['Hora', app.time],
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html = rows
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f4f4f5;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.16em;font-weight:700;width:35%;">${escapeHtml(
            k
          )}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f4f4f5;color:#18181b;font-weight:700;font-size:15px;">${escapeHtml(
            v
          )}</td>
        </tr>`
    )
    .join('');
  return { text, html };
}

function buildSubscriptionDetailRows(status: ClientSubscriptionStatus): Array<[string, string]> {
  return [
    ['Abono', status.planName],
    ['Cortes disponibles', `${status.cutsRemaining} de ${status.cutsPerMonth}`],
    ['Cortes usados este mes', String(status.cutsUsed)],
    ['Vigencia del abono', `${fmtDate(status.periodStart)} – ${fmtDate(status.periodEnd)}`],
  ];
}

function rowsToHtml(rows: Array<[string, string]>): string {
  return rows
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f4f4f5;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.16em;font-weight:700;width:35%;">${escapeHtml(
            k
          )}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f4f4f5;color:#18181b;font-weight:700;font-size:15px;">${escapeHtml(
            v
          )}</td>
        </tr>`
    )
    .join('');
}

function rowsToText(rows: Array<[string, string]>): string {
  return rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}

function mergeAppointmentAndSubscriptionDetails(
  app: Appointment,
  subscription: ClientSubscriptionStatus | null
): { text: string; html: string; subscriptionNoticeHtml?: string } {
  const { text: apptText, html: apptHtml } = buildAppointmentTable(app);
  if (!subscription) {
    return { text: apptText, html: apptHtml };
  }
  const subRows = buildSubscriptionDetailRows(subscription);
  const text = `${apptText}\n\nTu abono:\n${rowsToText(subRows)}`;
  const html = `${apptHtml}${rowsToHtml(subRows)}`;
  const subscriptionNoticeHtml =
    subscription.cutsRemaining <= 0
      ? `Tu abono «${escapeHtml(subscription.planName)}» no tiene cortes disponibles este mes (${subscription.cutsUsed}/${subscription.cutsPerMonth} usados).`
      : `Con tu abono «${escapeHtml(subscription.planName)}» te quedan <strong>${subscription.cutsRemaining}</strong> corte${subscription.cutsRemaining === 1 ? '' : 's'} disponible${subscription.cutsRemaining === 1 ? '' : 's'} este mes (hasta el ${escapeHtml(fmtDate(subscription.periodEnd))}).`;
  return { text, html, subscriptionNoticeHtml };
}

async function loadSubscriptionForAppointment(
  app: Appointment
): Promise<ClientSubscriptionStatus | null> {
  if (app.userId == null || !Number.isFinite(Number(app.userId))) return null;
  try {
    return await getClientSubscriptionStatus(Number(app.userId));
  } catch {
    return null;
  }
}

function getClientPerfilUrl(): string {
  return `${getFrontendUrlForEmail()}/perfil`;
}

function getClientReservaUrl(): string {
  return `${getFrontendUrlForEmail()}/#reserva`;
}

function getFrontendUrlForEmail(): string {
  const u = (process.env.FRONTEND_URL ?? 'http://localhost:3000').trim();
  return u.replace(/\/$/, '');
}

/** Enlace al perfil del cliente con modal de reprogramación abierto para ese turno. */
export function getClientPerfilRescheduleUrl(appointmentId: string): string {
  const base = getFrontendUrlForEmail();
  return `${base}/perfil?reprogramar=${encodeURIComponent(appointmentId)}`;
}

function getEmailLogoUrl(): string {
  const override = (process.env.EMAIL_LOGO_URL ?? '').trim();
  if (override) return override;
  return `${getFrontendUrlForEmail()}/lion-logo-hero-for-ui.png`;
}

interface BrandedEmailOpts {
  accentColor?: string;
  eyebrow?: string;
  title: string;
  greeting?: string;
  intro?: string;
  detailsHtml: string;
  noticeColor?: 'amber' | 'green' | 'red' | 'zinc';
  noticeHtml?: string;
  cta?: { label: string; url: string };
  /** Segundo botón (p. ej. reprogramar) debajo del CTA principal. */
  secondaryCta?: { label: string; url: string };
  outro?: string;
}

function renderBrandedEmail(opts: BrandedEmailOpts): string {
  const shopName = getShopNameForEmails();
  const logoUrl = getEmailLogoUrl();
  const accent = opts.accentColor ?? '#e5c185';
  const noticePalette: Record<NonNullable<BrandedEmailOpts['noticeColor']>, { bg: string; border: string; color: string }> = {
    amber: { bg: '#fef9c3', border: '#fde68a', color: '#854d0e' },
    green: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
    red: { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
    zinc: { bg: '#f4f4f5', border: '#e4e4e7', color: '#3f3f46' },
  };
  const noticeStyle = noticePalette[opts.noticeColor ?? 'amber'];
  const eyebrow = opts.eyebrow ?? shopName.toUpperCase();
  const greetingHtml = opts.greeting ? `<p style="margin:0 0 10px;font-size:16px;">${opts.greeting}</p>` : '';
  const introHtml = opts.intro ? `<p style="margin:0 0 18px;color:#3f3f46;">${opts.intro}</p>` : '';
  const noticeHtml = opts.noticeHtml
    ? `<div style="margin:18px 0 4px;padding:14px 16px;border:1px solid ${noticeStyle.border};background:${noticeStyle.bg};border-radius:12px;font-size:14px;color:${noticeStyle.color};">${opts.noticeHtml}</div>`
    : '';
  const ctaHtml = opts.cta
    ? `<p style="margin:24px 0 4px;text-align:center;">
         <a href="${escapeHtml(opts.cta.url)}"
            style="display:inline-block;background:${accent};color:#0a0a0a;font-weight:800;text-decoration:none;padding:13px 26px;border-radius:12px;letter-spacing:.1em;text-transform:uppercase;font-size:13px;box-shadow:0 8px 18px rgba(229,193,133,.35);">
           ${escapeHtml(opts.cta.label)}
         </a>
       </p>`
    : '';
  const secondaryCtaHtml = opts.secondaryCta
    ? `<p style="margin:12px 0 4px;text-align:center;">
         <a href="${escapeHtml(opts.secondaryCta.url)}"
            style="display:inline-block;background:#ffffff;color:#18181b;font-weight:800;text-decoration:none;padding:12px 24px;border-radius:12px;letter-spacing:.08em;text-transform:uppercase;font-size:12px;border:2px solid ${accent};">
           ${escapeHtml(opts.secondaryCta.label)}
         </a>
       </p>`
    : '';
  const outroHtml = opts.outro
    ? `<p style="margin:22px 0 0;font-size:13px;color:#71717a;">${opts.outro}</p>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${escapeHtml(opts.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Segoe UI,system-ui,-apple-system,Arial,sans-serif;color:#18181b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${escapeHtml(opts.title)} - ${escapeHtml(shopName)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a 0%,#0a0a0a 220px,#f4f4f5 220px,#f4f4f5 100%);padding:36px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
            <tr>
              <td align="center" style="padding:8px 8px 22px;">
                <img src="${escapeHtml(logoUrl)}" width="92" height="92" alt="${escapeHtml(shopName)}" style="display:block;border:0;outline:0;background:#0a0a0a;border-radius:50%;" />
                <div style="margin-top:14px;font-size:11px;letter-spacing:.32em;color:${accent};text-transform:uppercase;font-weight:700;">${escapeHtml(eyebrow)}</div>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 24px 48px rgba(0,0,0,.18);">
                <div style="background:#0a0a0a;color:#fff;padding:22px 28px;border-bottom:3px solid ${accent};">
                  <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${accent};font-weight:700;">${escapeHtml(shopName)}</div>
                  <div style="font-size:24px;font-weight:900;margin-top:6px;letter-spacing:.01em;">${escapeHtml(opts.title)}</div>
                </div>
                <div style="padding:26px 28px 8px;font-size:15px;line-height:1.6;color:#27272a;">
                  ${greetingHtml}
                  ${introHtml}
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;background:#fafafa;">
                    ${opts.detailsHtml}
                  </table>
                  ${noticeHtml}
                  ${ctaHtml}
                  ${secondaryCtaHtml}
                  ${outroHtml}
                </div>
                <div style="background:#0a0a0a;color:#a1a1aa;padding:18px 28px;text-align:center;font-size:12px;letter-spacing:.04em;">
                  <div style="color:${accent};font-weight:700;letter-spacing:.28em;text-transform:uppercase;font-size:11px;">${escapeHtml(shopName)}</div>
                  <div style="margin-top:6px;">Tu barbería de confianza</div>
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 8px;color:#a1a1aa;font-size:11px;letter-spacing:.04em;">
                Este es un mensaje automático de ${escapeHtml(shopName)}. No respondas a este correo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

interface SendOpts {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface ResendConfig {
  apiKey: string;
  from: string;
  shopName: string;
}

function getShopNameForEmails(): string {
  return (process.env.SHOP_NAME ?? 'Lion Barber').trim() || 'Lion Barber';
}

function isEmailProviderConfigured(): boolean {
  const resendKey = (process.env.RESEND_API_KEY ?? '').trim();
  if (resendKey) return true;
  const host = (process.env.SMTP_HOST ?? '').trim();
  const user = (process.env.SMTP_USER ?? '').trim();
  const password = (process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS ?? '').trim();
  return Boolean(host && user && password);
}

function getResendConfig(): ResendConfig | null {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
  if (!apiKey) return null;
  const fromEnv = (process.env.RESEND_FROM ?? process.env.SMTP_FROM ?? '').trim();
  const from = fromEnv || 'onboarding@resend.dev';
  return { apiKey, from, shopName: getShopNameForEmails() };
}

async function sendMailViaResend(cfg: ResendConfig, opts: SendOpts): Promise<void> {
  const from = cfg.from.includes('<') ? cfg.from : `${cfg.shopName} <${cfg.from}>`;
  console.log(
    `[Email] Intentando enviar via Resend API from="${from}" to="${opts.to}" subject="${opts.subject}"`
  );
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    });
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      console.error(`[Email] Resend HTTP ${res.status}: ${body}`);
      return;
    }
    console.log(`[Email] OK Resend respuesta=${body}`);
  } catch (err) {
    console.error('[Email] Error enviando con Resend', err);
  }
}

async function sendMailViaSmtp(opts: SendOpts): Promise<void> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    console.warn(
      `[Email] OMITIDO: no hay proveedor configurado (RESEND_API_KEY o SMTP_*). Asunto="${opts.subject}" Destino="${opts.to}"`
    );
    return;
  }
  console.log(
    `[Email] Intentando enviar via SMTP ${cfg.host}:${cfg.port} (secure=${cfg.secure}) from="${cfg.from}" to="${opts.to}" subject="${opts.subject}"`
  );
  try {
    const transporter = getTransporter(cfg);
    const info = await transporter.sendMail({
      from: cfg.from.includes('<') ? cfg.from : `"${cfg.shopName}" <${cfg.from}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    console.log(
      `[Email] OK SMTP messageId=${info.messageId ?? '-'} response=${info.response ?? '-'} accepted=${(
        info.accepted ?? []
      )
        .map(String)
        .join(',')} rejected=${(info.rejected ?? []).map(String).join(',') || '-'}`
    );
  } catch (err) {
    console.error('[Email] Error enviando mail SMTP', opts.subject, '→', opts.to, err);
  }
}

async function sendMail(opts: SendOpts): Promise<void> {
  const resend = getResendConfig();
  if (resend) {
    await sendMailViaResend(resend, opts);
    return;
  }
  await sendMailViaSmtp(opts);
}

/** Aviso al cliente: turno reservado y esperando que se pague la seña. */
export async function sendDepositPendingEmail(
  email: string,
  app: Appointment,
  options: { paymentUrl?: string; paymentDueAt?: string | null; depositMinutes: number }
): Promise<void> {
  if (!isRealClientEmail(email)) return;
  if (!isEmailProviderConfigured()) {
    console.warn('[Email] OMITIDO sendDepositPendingEmail: no hay proveedor configurado (RESEND_API_KEY o SMTP_*).');
    return;
  }
  const shopName = getShopNameForEmails();

  const subscription = await loadSubscriptionForAppointment(app);
  const { text: detailsText, html: detailsHtml, subscriptionNoticeHtml } =
    mergeAppointmentAndSubscriptionDetails(app, subscription);
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Hola';
  const minutes = options.depositMinutes;

  const text = [
    `${greetingName}, reservamos tu turno y estamos esperando que se acredite el pago de la seña.`,
    '',
    'Detalles del turno:',
    detailsText,
    '',
    `Tenés ${minutes} minutos para completar el pago, si no se cancela automáticamente.`,
    options.paymentUrl ? `Pagar ahora: ${options.paymentUrl}` : '',
    '',
    `Reprogramar u otro horario: ${getClientPerfilRescheduleUrl(app.id)}`,
    '',
    `Gracias por elegir ${shopName}.`,
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderBrandedEmail({
    title: 'Tu turno está reservado',
    greeting: `Hola <strong>${escapeHtml(greetingName)}</strong>,`,
    intro: 'Reservamos tu horario y estamos esperando que se acredite el pago de la seña para confirmarlo.',
    detailsHtml,
    noticeColor: 'amber',
    noticeHtml: subscriptionNoticeHtml
      ? `${subscriptionNoticeHtml}<br /><br />Tenés <strong>${minutes} minutos</strong> para completar el pago. Si no se acredita en ese plazo, la reserva se cancela automáticamente.`
      : `Tenés <strong>${minutes} minutos</strong> para completar el pago. Si no se acredita en ese plazo, la reserva se cancela automáticamente.`,
    cta: options.paymentUrl ? { label: 'Pagar la seña', url: options.paymentUrl } : undefined,
    secondaryCta: { label: 'Reprogramar turno', url: getClientPerfilRescheduleUrl(app.id) },
    outro: 'También podés gestionar tus turnos desde tu perfil en nuestro sitio.',
  });

  await sendMail({
    to: email,
    subject: `Tu turno en ${shopName} está esperando el pago de la seña`,
    text,
    html,
  });
}

/** Aviso al cliente: el turno fue agendado (sin pago de seña, ej. desde el panel del admin). */
export async function sendAppointmentScheduledEmail(
  email: string,
  app: Appointment
): Promise<void> {
  if (!isRealClientEmail(email)) return;
  if (!isEmailProviderConfigured()) {
    console.warn('[Email] OMITIDO sendAppointmentScheduledEmail: no hay proveedor configurado (RESEND_API_KEY o SMTP_*).');
    return;
  }
  const shopName = getShopNameForEmails();

  const subscription = await loadSubscriptionForAppointment(app);
  const { text: detailsText, html: detailsHtml, subscriptionNoticeHtml } =
    mergeAppointmentAndSubscriptionDetails(app, subscription);
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Hola';
  const reproUrl = getClientPerfilRescheduleUrl(app.id);

  const text = [
    `${greetingName}, agendamos tu turno en ${shopName}.`,
    '',
    'Detalles del turno:',
    detailsText,
    '',
    'Recordá que hay 10 minutos de tolerancia desde la hora del turno.',
    '',
    `Reprogramar turno: ${reproUrl}`,
    '',
    `Te esperamos en ${shopName}.`,
  ].join('\n');

  const html = renderBrandedEmail({
    title: 'Tu turno fue agendado',
    greeting: `Hola <strong>${escapeHtml(greetingName)}</strong>,`,
    intro: 'Agendamos tu turno con éxito. Te dejamos los detalles para que los tengas a mano.',
    detailsHtml,
    noticeColor: subscription?.cutsRemaining === 0 ? 'amber' : 'green',
    noticeHtml: subscriptionNoticeHtml
      ? `${subscriptionNoticeHtml}<br /><br />Recordá que hay <strong>10 minutos de tolerancia</strong> desde la hora del turno.`
      : 'Recordá que hay <strong>10 minutos de tolerancia</strong> desde la hora del turno.',
    cta: { label: 'Reprogramar turno', url: reproUrl },
    secondaryCta: subscription ? { label: 'Ver mi abono', url: getClientPerfilUrl() } : undefined,
    outro: '¡Te esperamos!',
  });

  await sendMail({
    to: email,
    subject: `Tu turno en ${shopName} fue agendado`,
    text,
    html,
  });
}

/** Aviso al cliente: la seña se acreditó y el turno quedó confirmado. */
export async function sendDepositConfirmedEmail(
  email: string,
  app: Appointment
): Promise<void> {
  if (!isRealClientEmail(email)) return;
  if (!isEmailProviderConfigured()) {
    console.warn('[Email] OMITIDO sendDepositConfirmedEmail: no hay proveedor configurado (RESEND_API_KEY o SMTP_*).');
    return;
  }
  const shopName = getShopNameForEmails();

  const subscription = await loadSubscriptionForAppointment(app);
  const { text: detailsText, html: detailsHtml, subscriptionNoticeHtml } =
    mergeAppointmentAndSubscriptionDetails(app, subscription);
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Hola';
  const reproUrl = getClientPerfilRescheduleUrl(app.id);

  const text = [
    `${greetingName}, recibimos el pago de la seña y tu turno está confirmado.`,
    '',
    'Detalles del turno:',
    detailsText,
    '',
    'Recordá que hay 10 minutos de tolerancia desde la hora de tu turno.',
    '',
    `Reprogramar turno: ${reproUrl}`,
    '',
    `Te esperamos en ${shopName}.`,
  ].join('\n');

  const html = renderBrandedEmail({
    title: '¡Tu turno está confirmado!',
    greeting: `Hola <strong>${escapeHtml(greetingName)}</strong>,`,
    intro: 'Recibimos el pago de la seña. Tu turno quedó confirmado.',
    detailsHtml,
    noticeColor: subscription?.cutsRemaining === 0 ? 'amber' : 'green',
    noticeHtml: subscriptionNoticeHtml
      ? `${subscriptionNoticeHtml}<br /><br />Recordá que hay <strong>10 minutos de tolerancia</strong> desde la hora del turno.`
      : 'Recordá que hay <strong>10 minutos de tolerancia</strong> desde la hora del turno.',
    cta: { label: 'Reprogramar turno', url: reproUrl },
    secondaryCta: subscription ? { label: 'Ver mi abono', url: getClientPerfilUrl() } : undefined,
    outro: '¡Te esperamos!',
  });

  await sendMail({
    to: email,
    subject: `Tu turno en ${shopName} quedó confirmado`,
    text,
    html,
  });
}

/** Recordatorio ~2 h 30 min antes del turno (solo turnos scheduled con cuenta). */
export async function sendAppointmentReminder1hEmail(email: string, app: Appointment): Promise<void> {
  if (!isRealClientEmail(email)) return;
  if (!isEmailProviderConfigured()) {
    console.warn('[Email] OMITIDO sendAppointmentReminder1hEmail: no hay proveedor configurado (RESEND_API_KEY o SMTP_*).');
    return;
  }
  const shopName = getShopNameForEmails();
  const { text: detailsText, html: detailsHtml } = buildAppointmentTable(app);
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Hola';
  const reproUrl = getClientPerfilRescheduleUrl(app.id);

  const text = [
    `${greetingName}, en aproximadamente 2 horas y media tenés turno en ${shopName}.`,
    '',
    'Detalles del turno:',
    detailsText,
    '',
    'Si necesitás cancelar o reprogramar, hacelo desde el sitio con al menos 2 horas de anticipación al horario del turno.',
    '',
    `Reprogramar o ver tus turnos: ${reproUrl}`,
    '',
    `Te esperamos.`,
  ].join('\n');

  const html = renderBrandedEmail({
    title: 'Recordatorio: tu turno es en 2 horas y media',
    greeting: `Hola <strong>${escapeHtml(greetingName)}</strong>,`,
    intro:
      'Te recordamos que en aproximadamente <strong>2 horas y media</strong> comienza tu turno. Si ya no podés asistir, cancelá o reprogramá desde el sitio <strong>antes de que falten 2 horas</strong> para el horario pactado.',
    detailsHtml,
    noticeColor: 'zinc',
    noticeHtml:
      'Recordá la tolerancia de <strong>10 minutos</strong> desde la hora pactada. Con menos de <strong>2 horas</strong> de anticipación no podés cancelar ni reprogramar desde la web; la seña no se reembolsa en ese caso.',
    cta: { label: 'Reprogramar turno', url: reproUrl },
    outro: `Equipo ${shopName}`,
  });

  await sendMail({
    to: email,
    subject: `Recordatorio: tu turno en ${shopName} es en 2 horas y media`,
    text,
    html,
  });
}

/** Aviso al cliente: abono activado (compra online o asignación del local). */
export async function sendSubscriptionActivatedEmail(
  email: string,
  clientName: string,
  status: ClientSubscriptionStatus
): Promise<void> {
  if (!isRealClientEmail(email)) return;
  if (!isEmailProviderConfigured()) {
    console.warn(
      '[Email] OMITIDO sendSubscriptionActivatedEmail: no hay proveedor configurado (RESEND_API_KEY o SMTP_*).'
    );
    return;
  }
  const shopName = getShopNameForEmails();
  const greetingName = clientName.trim().split(/\s+/)[0] || 'Hola';
  const subRows: Array<[string, string]> = [
    ['Plan', status.planName],
    ['Precio mensual', status.monthlyPrice],
    ['Cortes incluidos', `${status.cutsPerMonth} por mes`],
    ['Cortes disponibles ahora', `${status.cutsRemaining} de ${status.cutsPerMonth}`],
    ['Vigencia', `${fmtDate(status.periodStart)} – ${fmtDate(status.periodEnd)}`],
  ];
  const detailsText = rowsToText(subRows);
  const detailsHtml = rowsToHtml(subRows);

  const text = [
    `${greetingName}, tu abono en ${shopName} ya está activo.`,
    '',
    detailsText,
    '',
    'Podés reservar turnos online sin pagar seña mientras tengas cortes disponibles.',
    '',
    `Ver tu abono: ${getClientPerfilUrl()}`,
    `Reservar turno: ${getClientReservaUrl()}`,
  ].join('\n');

  const html = renderBrandedEmail({
    title: '¡Tu abono está activo!',
    greeting: `Hola <strong>${escapeHtml(greetingName)}</strong>,`,
    intro:
      'Recibimos tu pago y activamos tu abono mensual. Desde ahora podés reservar sin seña mientras tengas cortes disponibles en el mes.',
    detailsHtml,
    noticeColor: 'green',
    noticeHtml: `Tenés <strong>${status.cutsRemaining}</strong> corte${status.cutsRemaining === 1 ? '' : 's'} disponible${status.cutsRemaining === 1 ? '' : 's'} hasta el <strong>${escapeHtml(fmtDate(status.periodEnd))}</strong>.`,
    cta: { label: 'Reservar turno', url: getClientReservaUrl() },
    secondaryCta: { label: 'Ver mi abono', url: getClientPerfilUrl() },
    outro: 'Podés seguir el consumo de tu abono en cualquier momento desde tu perfil.',
  });

  await sendMail({
    to: email,
    subject: `Tu abono en ${shopName} está activo`,
    text,
    html,
  });
}

/** Envía confirmación de abono si el cliente tiene email real. */
export async function notifyClientSubscriptionActivated(userId: number): Promise<void> {
  try {
    const { findUserById } = await import('../repositories/users.js');
    const user = await findUserById(userId);
    if (!user || !isRealClientEmail(user.email)) return;
    const status = await getClientSubscriptionStatus(userId);
    if (!status) return;
    console.log(`[Email] Disparando aviso de abono activado a userId=${userId} email=${user.email}`);
    await sendSubscriptionActivatedEmail(user.email, user.name, status);
  } catch (err) {
    console.error('[Email] No se pudo enviar aviso de abono activado', err);
  }
}
