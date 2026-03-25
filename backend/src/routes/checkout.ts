import { Router } from 'express';
import type { Request, Response } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import * as repo from '../repositories/appointments.js';
import { getShopSettings } from '../repositories/shopSettings.js';
import { getServiceById } from '../repositories/services.js';
import { isDateOnOpenWeekday } from '../appointmentRules.js';

const router = Router();

function getMpConfig(): MercadoPagoConfig | null {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;
  return new MercadoPagoConfig({ accessToken: token });
}

function parseArsAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized = cleaned;
  if (hasDot && hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/\./g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function calculateDepositAmountArs(servicePriceArs: number, depositPercent: number): number {
  const raw = (servicePriceArs * depositPercent) / 100;
  const rounded = Math.round(raw);
  return Math.max(1, rounded);
}

function getFrontendUrl(): string {
  const u = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  return u.replace(/\/$/, '');
}

/** URL pública del backend para notificaciones IPN (ngrok o dominio en producción). */
function getApiPublicUrl(): string | null {
  const u = process.env.API_PUBLIC_URL ?? process.env.BACKEND_PUBLIC_URL;
  if (!u) return null;
  return u.replace(/\/$/, '');
}

/** Referencia compacta en external_reference (máx. ~256 caracteres en MP). */
interface BookingRefV1 {
  v: 1;
  a: string;
  n: string;
  p: string;
  s: string;
  i: string;
  b: string;
  d: string;
  t: string;
  m: number;
  u: string;
}

function buildBookingRef(input: {
  appointmentId: string;
  name: string;
  phone: string;
  service: string;
  serviceId: string;
  barberId: string;
  date: string;
  time: string;
  durationMinutes: number;
  userId: string;
}): string {
  const ref: BookingRefV1 = {
    v: 1,
    a: input.appointmentId,
    n: input.name,
    p: input.phone,
    s: input.service,
    i: input.serviceId,
    b: input.barberId,
    d: input.date,
    t: input.time,
    m: input.durationMinutes,
    u: input.userId,
  };
  const j = JSON.stringify(ref);
  if (j.length > 256) {
    throw new Error(
      'Los datos del turno superan el límite de Mercado Pago. Probá con un nombre más corto.'
    );
  }
  return j;
}

function parseBookingRef(
  externalReference: string | undefined,
  metadata: Record<string, unknown> | undefined
): BookingRefV1 | null {
  if (externalReference) {
    try {
      const o = JSON.parse(externalReference) as BookingRefV1;
      if (o.v === 1 && o.a && o.n && o.b && o.d && o.t) return o;
    } catch {
      /* preferencia antigua u otro formato */
    }
  }
  if (metadata && typeof metadata === 'object') {
    const m = metadata as Record<string, string>;
    if (m.lb_n) {
      return {
        v: 1,
        a: m.lb_a ?? '',
        n: m.lb_n,
        p: m.lb_p ?? '',
        s: m.lb_s ?? '',
        i: m.lb_i ?? '',
        b: m.lb_b ?? '',
        d: m.lb_d ?? '',
        t: m.lb_t ?? '',
        m: parseInt(m.lb_m ?? '30', 10) || 30,
        u: m.lb_u ?? '',
      };
    }
  }
  return null;
}

function extractPaymentId(req: Request): string | undefined {
  const q = req.query as Record<string, string | undefined>;
  if (q.topic === 'payment' && q.id) return String(q.id);
  const body = req.body as Record<string, unknown> | null | undefined;
  if (!body || typeof body !== 'object') return undefined;
  const data = body.data as { id?: string | number } | undefined;
  if (data?.id != null) return String(data.id);
  const resource = body.resource;
  if (typeof resource === 'string') {
    const match = resource.match(/(\d+)\s*$/);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Checkout Pro: preferencia de pago por la seña. El turno se crea al aprobar el pago (webhook / IPN).
 */
router.post('/sena', async (req, res) => {
  const config = getMpConfig();
  if (!config) {
    return res
      .status(503)
      .json({ error: 'Mercado Pago no está configurado (MERCADOPAGO_ACCESS_TOKEN).' });
  }

  const { name, phone, service, serviceId, barberId, date, time, userId } = req.body as {
    name?: string;
    phone?: string;
    service?: string;
    serviceId?: string;
    barberId?: string;
    date?: string;
    time?: string;
    userId?: number;
  };

  if (!name || !phone || !service || !barberId || !date || !time) {
    return res.status(400).json({ error: 'Faltan datos para la reserva con seña' });
  }

  const shop = await getShopSettings();
  if (!isDateOnOpenWeekday(date, shop.openWeekdays)) {
    return res.status(400).json({ error: 'El local no atiende ese día. Elegí otra fecha.' });
  }

  let durationMinutes: number;
  try {
    durationMinutes = await repo.resolveDurationMinutes(serviceId, service);
  } catch {
    durationMinutes = 30;
  }

  try {
    await repo.expireStalePendingAppointments();
    if (barberId !== repo.ANY_BARBER_ID) {
      await repo.assertNoOverlap(barberId, date, time, durationMinutes);
    } else {
      const resolved = await repo.resolveBarberForAny(date, time, durationMinutes);
      if (!resolved) {
        return res.status(409).json({ error: 'No hay barbero disponible en ese horario' });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Conflicto de horario';
    return res.status(409).json({ error: msg });
  }

  let pending;
  const paymentDueAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  try {
    pending = await repo.createAppointment({
      name,
      phone,
      service,
      serviceId: serviceId ?? undefined,
      barberId,
      date,
      time,
      durationMinutes,
      status: 'pending_payment',
      paymentDueAt,
      depositPaid: false,
      ...(userId != null ? { userId: Number(userId) } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo reservar temporalmente el horario';
    return res.status(409).json({ error: msg });
  }

  let externalReference: string;
  try {
    externalReference = buildBookingRef({
      appointmentId: pending.id,
      name,
      phone,
      service,
      serviceId: serviceId ?? '',
      barberId,
      date,
      time,
      durationMinutes,
      userId: userId != null ? String(userId) : '',
    });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'Datos inválidos' });
  }

  const serviceEntity = serviceId ? await getServiceById(serviceId) : null;
  const servicePriceArs = parseArsAmount(serviceEntity?.price ?? service);
  if (!servicePriceArs) {
    return res.status(400).json({ error: 'No se pudo calcular la seña: precio del servicio inválido.' });
  }
  const amountArs = calculateDepositAmountArs(servicePriceArs, shop.depositPercent);
  const base = getFrontendUrl();
  const apiPublic = getApiPublicUrl();

  const preference = new Preference(config);
  const body = {
    items: [
      {
        id: 'lion-sena',
        title: 'Seña — Lion Barber',
        quantity: 1,
        unit_price: amountArs,
        currency_id: 'ARS',
      },
    ],
    external_reference: externalReference,
    metadata: {
      lb_a: pending.id,
      lb_n: name,
      lb_p: phone,
      lb_s: service,
      lb_i: serviceId ?? '',
      lb_b: barberId,
      lb_d: date,
      lb_t: time,
      lb_m: String(durationMinutes),
      lb_u: userId != null ? String(userId) : '',
    },
    back_urls: {
      success: `${base}/?checkout=success`,
      failure: `${base}/?checkout=failure`,
      pending: `${base}/?checkout=pending`,
    },
    auto_return: 'approved' as const,
    ...(apiPublic ? { notification_url: `${apiPublic}/api/webhooks/mercadopago` } : {}),
  };

  let result;
  try {
    result = await preference.create({ body });
  } catch (e) {
    console.error('Mercado Pago preference.create:', e);
    await repo.updateAppointment(pending.id, { status: 'cancelled' });
    return res.status(502).json({
      error: 'No se pudo iniciar el pago con Mercado Pago. Revisá credenciales y montos.',
    });
  }

  const url = result.sandbox_init_point ?? result.init_point;
  if (!url) {
    return res.status(500).json({ error: 'Mercado Pago no devolvió URL de pago' });
  }

  res.json({ url, appointmentId: pending.id, paymentDueAt });
});

export default router;

export async function mercadopagoWebhook(req: Request, res: Response): Promise<void> {
  const paymentId = extractPaymentId(req);
  if (!paymentId) {
    res.status(400).send('Sin id de pago');
    return;
  }

  res.status(200).send('OK');

  const config = getMpConfig();
  if (!config) {
    console.error('Webhook MP: MERCADOPAGO_ACCESS_TOKEN no configurado');
    return;
  }

  const existing = await repo.getAppointmentByMercadopagoPaymentId(paymentId);
  if (existing) return;

  const paymentClient = new Payment(config);
  let payment;
  try {
    payment = await paymentClient.get({ id: Number(paymentId) });
  } catch (e) {
    console.error('Webhook MP: no se pudo obtener el pago', paymentId, e);
    return;
  }

  if (payment.status !== 'approved') return;

  const ref = parseBookingRef(
    payment.external_reference,
    payment.metadata as Record<string, unknown> | undefined
  );
  if (!ref) {
    console.error('Webhook MP: sin datos de reserva en el pago', paymentId);
    return;
  }

  const userId = ref.u ? parseInt(ref.u, 10) : undefined;

  const existingByRefId = ref.a ? await repo.getAppointmentById(ref.a) : null;
  if (existingByRefId) {
    await repo.markAppointmentPaidAndScheduled(existingByRefId.id, paymentId);
    return;
  }

  try {
    await repo.createAppointment({
      name: ref.n,
      phone: ref.p,
      service: ref.s,
      serviceId: ref.i || undefined,
      barberId: ref.b,
      date: ref.d,
      time: ref.t,
      durationMinutes: ref.m,
      depositPaid: true,
      mercadopagoPaymentId: paymentId,
      ...(userId != null && !Number.isNaN(userId) ? { userId } : {}),
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ER_DUP_ENTRY') return;
    console.error('Webhook MP: no se pudo crear el turno (revisá cupo / reembolso)', e);
  }
}
