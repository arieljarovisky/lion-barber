import nodemailer, { type Transporter } from 'nodemailer';
import type { Appointment } from '../types.js';
import { PLACEHOLDER_EMAIL_HOST } from '../repositories/users.js';

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
        `<tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(
          k
        )}</td><td style="padding:6px 0;color:#18181b;font-weight:600;">${escapeHtml(v)}</td></tr>`
    )
    .join('');
  return { text, html };
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
  const cfg = { shopName: getShopNameForEmails() };

  const { text: detailsText, html: detailsHtml } = buildAppointmentTable(app);
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Hola';
  const minutes = options.depositMinutes;

  const lines = [
    `${greetingName}, reservamos tu turno y estamos esperando que se acredite el pago de la seña.`,
    '',
    'Detalles del turno:',
    detailsText,
    '',
    `Tenés ${minutes} minutos para completar el pago, si no se cancela automáticamente.`,
    options.paymentUrl ? `Pagar ahora: ${options.paymentUrl}` : '',
    '',
    `Gracias por elegir ${cfg.shopName}.`,
  ];
  const text = lines.filter(Boolean).join('\n');

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:#18181b;color:#fff;padding:24px 28px;">
                <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#e5c185;">${escapeHtml(
                  cfg.shopName
                )}</div>
                <div style="font-size:22px;font-weight:800;margin-top:6px;">Tu turno está reservado</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;font-size:15px;line-height:1.55;color:#27272a;">
                <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(greetingName)}</strong>,</p>
                <p style="margin:0 0 16px;">Reservamos tu horario y estamos esperando que se acredite el pago de la seña para confirmar el turno.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
                  ${detailsHtml}
                </table>
                <div style="margin:16px 0;padding:12px 14px;border:1px solid #fde68a;background:#fef9c3;border-radius:10px;font-size:14px;color:#854d0e;">
                  Tenés <strong>${minutes} minutos</strong> para completar el pago. Si no se acredita en ese plazo, la reserva se cancela automáticamente.
                </div>
                ${
                  options.paymentUrl
                    ? `<p style="margin:18px 0 0;text-align:center;">
                        <a href="${escapeHtml(options.paymentUrl)}"
                           style="display:inline-block;background:#e5c185;color:#18181b;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px;letter-spacing:.04em;text-transform:uppercase;font-size:13px;">
                          Pagar la seña
                        </a>
                      </p>`
                    : ''
                }
                <p style="margin:22px 0 0;font-size:13px;color:#71717a;">También podés gestionar tus turnos desde tu perfil en el sitio.</p>
              </td>
            </tr>
            <tr>
              <td style="background:#fafafa;padding:14px 28px;font-size:12px;color:#a1a1aa;text-align:center;">
                Este es un mensaje automático de ${escapeHtml(cfg.shopName)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await sendMail({
    to: email,
    subject: `Tu turno en ${cfg.shopName} está esperando el pago de la seña`,
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
  const cfg = { shopName: getShopNameForEmails() };

  const { text: detailsText, html: detailsHtml } = buildAppointmentTable(app);
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Hola';

  const text = [
    `${greetingName}, agendamos tu turno en ${cfg.shopName}.`,
    '',
    'Detalles del turno:',
    detailsText,
    '',
    'Recordá que hay 10 minutos de tolerancia desde la hora del turno.',
    '',
    `Te esperamos en ${cfg.shopName}.`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:#18181b;color:#fff;padding:24px 28px;">
                <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#e5c185;">${escapeHtml(
                  cfg.shopName
                )}</div>
                <div style="font-size:22px;font-weight:800;margin-top:6px;">Tu turno fue agendado</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;font-size:15px;line-height:1.55;color:#27272a;">
                <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(greetingName)}</strong>,</p>
                <p style="margin:0 0 16px;">Agendamos tu turno:</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
                  ${detailsHtml}
                </table>
                <div style="margin:16px 0;padding:12px 14px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;font-size:14px;color:#166534;">
                  Recordá que hay <strong>10 minutos de tolerancia</strong> desde la hora del turno.
                </div>
                <p style="margin:18px 0 0;">¡Te esperamos!</p>
              </td>
            </tr>
            <tr>
              <td style="background:#fafafa;padding:14px 28px;font-size:12px;color:#a1a1aa;text-align:center;">
                Este es un mensaje automático de ${escapeHtml(cfg.shopName)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await sendMail({
    to: email,
    subject: `Tu turno en ${cfg.shopName} fue agendado`,
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
  const cfg = { shopName: getShopNameForEmails() };

  const { text: detailsText, html: detailsHtml } = buildAppointmentTable(app);
  const greetingName = (app.name ?? '').trim().split(/\s+/)[0] || 'Hola';

  const text = [
    `${greetingName}, recibimos el pago de la seña y tu turno está confirmado.`,
    '',
    'Detalles del turno:',
    detailsText,
    '',
    'Recordá que hay 10 minutos de tolerancia desde la hora de tu turno.',
    '',
    `Te esperamos en ${cfg.shopName}.`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:#16a34a;color:#fff;padding:24px 28px;">
                <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;opacity:.85;">${escapeHtml(
                  cfg.shopName
                )}</div>
                <div style="font-size:22px;font-weight:800;margin-top:6px;">¡Tu turno está confirmado!</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;font-size:15px;line-height:1.55;color:#27272a;">
                <p style="margin:0 0 12px;">Hola <strong>${escapeHtml(greetingName)}</strong>,</p>
                <p style="margin:0 0 16px;">Recibimos el pago de la seña. Tu turno quedó confirmado:</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
                  ${detailsHtml}
                </table>
                <div style="margin:16px 0;padding:12px 14px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;font-size:14px;color:#166534;">
                  Recordá que hay <strong>10 minutos de tolerancia</strong> desde la hora del turno.
                </div>
                <p style="margin:18px 0 0;">¡Te esperamos!</p>
              </td>
            </tr>
            <tr>
              <td style="background:#fafafa;padding:14px 28px;font-size:12px;color:#a1a1aa;text-align:center;">
                Este es un mensaje automático de ${escapeHtml(cfg.shopName)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await sendMail({
    to: email,
    subject: `Tu turno en ${cfg.shopName} quedó confirmado`,
    text,
    html,
  });
}
