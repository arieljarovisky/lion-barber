import { Router } from 'express';
import type { Request, Response } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import * as repo from '../repositories/appointments.js';
import { getShopSettings } from '../repositories/shopSettings.js';
import { getServiceById } from '../repositories/services.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import {
  hoursUntilAppointmentStart,
  isDateClosed,
  isDateOnOpenWeekday,
  isPastCalendarDateInArgentina,
} from '../appointmentRules.js';
import { notifyBarberByWhatsappOnDepositPaid } from '../services/whatsapp.js';
import { notifyShopPhoneAppointmentCreated } from '../services/mobileNotifications.js';
import {
  sendDepositConfirmedEmail,
  sendDepositPendingEmail,
  sendAppointmentScheduledEmail,
  notifyClientSubscriptionActivated,
  isRealClientEmail,
} from '../services/email.js';
import { findUserById } from '../repositories/users.js';
import { DEPOSIT_PERCENT } from '../constants/deposit.js';
import {
  isClientDepositExempt,
  assignSubscriptionPlanToClient,
} from '../services/clientSubscription.js';
import { getSubscriptionPlanById } from '../repositories/subscriptionPlans.js';
import {
  getSubscriptionPaymentByMpId,
  recordSubscriptionPayment,
  getActivePromotions,
  getPromotionById,
} from '../repositories/promotions.js';
import {
  createProductOrder,
  getProductOrderById,
  getProductPaymentByMpId,
  markProductOrderPaid,
  recordProductPayment,
} from '../repositories/productOrders.js';
import { resolveProductOrderLines } from '../services/productCheckout.js';
import { incrementClientPoints } from '../repositories/users.js';
import { getShopProductById, decrementProductStock } from '../repositories/shopProducts.js';
import {
  calculateBookingDepositArs,
  isPromotionActiveOnDate,
  resolveBookingPromotion,
} from '../services/sitePromotions.js';
import { getPendingPaymentMinutes, paymentDueAtFromNow } from '../depositPayment.js';
import { parseMercadoPagoTransactionAmountArs } from '../mercadopagoAmount.js';

const router = Router();

/** Re-export para tests / referencias externas. */
export const PENDING_PAYMENT_MINUTES = getPendingPaymentMinutes();

function getMpConfig(): MercadoPagoConfig | null {
  const raw = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!raw) return null;
  const token = raw.trim();
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

async function createMercadoPagoSenaPreference(
  config: MercadoPagoConfig,
  input: {
    appointmentId: string;
    name: string;
    phone: string;
    service: string;
    serviceId: string;
    barberId: string;
    date: string;
    time: string;
    durationMinutes: number;
    userId: number;
    /** Si true, MP redirige a /perfil tras el pago (flujo desde el perfil). */
    returnToProfile?: boolean;
  }
): Promise<{ preferenceId: string; url?: string }> {
  const serviceEntity = input.serviceId ? await getServiceById(input.serviceId) : null;
  const servicePriceArs = parseArsAmount(serviceEntity?.price ?? input.service);
  if (!servicePriceArs) {
    throw new Error('No se pudo calcular la seña: precio del servicio inválido.');
  }

  let amountArs = calculateDepositAmountArs(servicePriceArs, DEPOSIT_PERCENT);
  let itemTitle = 'Seña — Lion Barber';

  const existingApp = input.appointmentId
    ? await repo.getAppointmentById(input.appointmentId)
    : null;
  let promo =
    existingApp?.promotionId != null
      ? await getPromotionById(existingApp.promotionId)
      : null;
  if (promo && !isPromotionActiveOnDate(promo, input.date)) {
    promo = null;
  }
  if (!promo) {
    const activePromos = await getActivePromotions();
    promo = resolveBookingPromotion(activePromos, input.date);
  }
  const depositCalc = calculateBookingDepositArs(servicePriceArs, DEPOSIT_PERCENT, promo);
  amountArs = depositCalc.amountArs;
  if (depositCalc.promotionFullyPaid && promo?.discountPercent) {
    itemTitle = `Promo ${promo.discountPercent}% — Lion Barber (todo pago online)`;
  } else if (promo?.discountPercent) {
    itemTitle = `Seña — Lion Barber (promo ${promo.discountPercent}%)`;
  }

  const externalReference = buildBookingRef({
    appointmentId: input.appointmentId,
    name: input.name,
    phone: input.phone,
    service: input.service,
    serviceId: input.serviceId,
    barberId: input.barberId,
    date: input.date,
    time: input.time,
    durationMinutes: input.durationMinutes,
    userId: String(input.userId),
  });
  const base = getFrontendUrl();
  const apiPublic = getApiPublicUrl();
  const checkoutBase = input.returnToProfile ? `${base}/perfil` : `${base}/`;
  const preference = new Preference(config);
  const body = {
    items: [
      {
        id: 'lion-sena',
        title: itemTitle,
        quantity: 1,
        unit_price: amountArs,
        currency_id: 'ARS',
      },
    ],
    external_reference: externalReference,
    metadata: {
      lb_a: input.appointmentId,
      lb_n: input.name,
      lb_p: input.phone,
      lb_s: input.service,
      lb_i: input.serviceId,
      lb_b: input.barberId,
      lb_d: input.date,
      lb_t: input.time,
      lb_m: String(input.durationMinutes),
      lb_u: String(input.userId),
    },
    back_urls: {
      success: `${checkoutBase}?checkout=success`,
      failure: `${checkoutBase}?checkout=failure`,
      pending: `${checkoutBase}?checkout=pending`,
    },
    auto_return: 'approved' as const,
    ...(apiPublic ? { notification_url: `${apiPublic}/api/webhooks/mercadopago` } : {}),
  };
  const result = await preference.create({ body });
  const preferenceId = result.id != null ? String(result.id) : '';
  if (!preferenceId) {
    throw new Error('Mercado Pago no devolvió el id de preferencia');
  }
  const url = result.init_point ?? result.sandbox_init_point ?? undefined;
  return { preferenceId, ...(url ? { url } : {}) };
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

interface SubscriptionRefV2 {
  v: 2;
  k: 'subscription';
  p: string;
  u: string;
}

interface ProductOrderRefV2 {
  v: 2;
  k: 'product_order';
  o: string;
  u: string;
}

function buildSubscriptionRef(input: { planId: string; userId: number }): string {
  const ref: SubscriptionRefV2 = {
    v: 2,
    k: 'subscription',
    p: input.planId,
    u: String(input.userId),
  };
  return JSON.stringify(ref);
}

function parseSubscriptionRef(
  externalReference: string | undefined,
  metadata: Record<string, unknown> | undefined
): SubscriptionRefV2 | null {
  if (externalReference) {
    try {
      const o = JSON.parse(externalReference) as SubscriptionRefV2;
      if (o.v === 2 && o.k === 'subscription' && o.p && o.u) return o;
    } catch {
      /* otro formato */
    }
  }
  if (metadata && typeof metadata === 'object') {
    const m = metadata as Record<string, string>;
    if (m.lb_kind === 'subscription' && m.lb_p && m.lb_u) {
      return { v: 2, k: 'subscription', p: m.lb_p, u: m.lb_u };
    }
  }
  return null;
}

function buildProductOrderRef(input: { orderId: number; userId: number }): string {
  const ref: ProductOrderRefV2 = {
    v: 2,
    k: 'product_order',
    o: String(input.orderId),
    u: String(input.userId),
  };
  return JSON.stringify(ref);
}

function parseProductOrderRef(
  externalReference: string | undefined,
  metadata: Record<string, unknown> | undefined
): ProductOrderRefV2 | null {
  if (externalReference) {
    try {
      const o = JSON.parse(externalReference) as ProductOrderRefV2;
      if (o.v === 2 && o.k === 'product_order' && o.o && o.u) return o;
    } catch {
      /* otro formato */
    }
  }
  if (metadata && typeof metadata === 'object') {
    const m = metadata as Record<string, string>;
    if (m.lb_kind === 'product_order' && m.lb_o && m.lb_u) {
      return { v: 2, k: 'product_order', o: m.lb_o, u: m.lb_u };
    }
  }
  return null;
}

async function createMercadoPagoProductOrderPreference(
  config: MercadoPagoConfig,
  input: { orderId: number; userId: number; items: { id: string; title: string; quantity: number; unitPrice: number }[] }
): Promise<{ preferenceId: string; url?: string }> {
  const externalReference = buildProductOrderRef({ orderId: input.orderId, userId: input.userId });
  const base = getFrontendUrl();
  const apiPublic = getApiPublicUrl();
  const preference = new Preference(config);
  const body = {
    items: input.items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      currency_id: 'ARS',
    })),
    external_reference: externalReference,
    metadata: {
      lb_kind: 'product_order',
      lb_o: String(input.orderId),
      lb_u: String(input.userId),
    },
    back_urls: {
      success: `${base}/perfil?checkout=success&kind=products`,
      failure: `${base}/perfil?checkout=failure&kind=products`,
      pending: `${base}/perfil?checkout=pending&kind=products`,
    },
    auto_return: 'approved' as const,
    ...(apiPublic ? { notification_url: `${apiPublic}/api/webhooks/mercadopago` } : {}),
  };
  const result = await preference.create({ body });
  const preferenceId = result.id != null ? String(result.id) : '';
  if (!preferenceId) throw new Error('Mercado Pago no devolvió el id de preferencia');
  const url = result.init_point ?? result.sandbox_init_point ?? undefined;
  return { preferenceId, ...(url ? { url } : {}) };
}

async function createMercadoPagoSubscriptionPreference(
  config: MercadoPagoConfig,
  input: { planId: string; planName: string; amountArs: number; userId: number }
): Promise<{ preferenceId: string; url?: string }> {
  const externalReference = buildSubscriptionRef({ planId: input.planId, userId: input.userId });
  const base = getFrontendUrl();
  const apiPublic = getApiPublicUrl();
  const preference = new Preference(config);
  const body = {
    items: [
      {
        id: `lion-abono-${input.planId}`,
        title: `Abono — ${input.planName}`,
        quantity: 1,
        unit_price: input.amountArs,
        currency_id: 'ARS',
      },
    ],
    external_reference: externalReference,
    metadata: {
      lb_kind: 'subscription',
      lb_p: input.planId,
      lb_u: String(input.userId),
    },
    back_urls: {
      success: `${base}/?checkout=subscription_success`,
      failure: `${base}/?checkout=subscription_failure`,
      pending: `${base}/?checkout=subscription_pending`,
    },
    auto_return: 'approved' as const,
    ...(apiPublic ? { notification_url: `${apiPublic}/api/webhooks/mercadopago` } : {}),
  };
  const result = await preference.create({ body });
  const preferenceId = result.id != null ? String(result.id) : '';
  if (!preferenceId) {
    throw new Error('Mercado Pago no devolvió el id de preferencia');
  }
  const url = result.init_point ?? result.sandbox_init_point ?? undefined;
  return { preferenceId, ...(url ? { url } : {}) };
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
  const body = req.body as Record<string, unknown> | null | undefined;
  if (!body || typeof body !== 'object') return undefined;

  const action = (body as { action?: unknown }).action;
  const isPaymentEvent =
    q.topic === 'payment' ||
    (typeof action === 'string' && action.startsWith('payment.')) ||
    (typeof (body as { type?: unknown }).type === 'string' && (body as any).type === 'payment');

  // Para evitar consultar "Payment" con ids que pertenecen a otros topics (ej. merchant_order),
  // solo usamos el id cuando parece ser un evento de pago.
  if (isPaymentEvent && q.topic === 'payment' && q.id) return String(q.id);

  const data = (body as { data?: unknown }).data as { id?: string | number; type?: string } | undefined;
  if (data?.id != null) {
    if (data.type && data.type !== 'payment' && !isPaymentEvent) return undefined;
    return String(data.id);
  }

  const bodyId = (body as { id?: unknown }).id;
  if (isPaymentEvent && (typeof bodyId === 'string' || typeof bodyId === 'number')) {
    return String(bodyId);
  }

  const resource = (body as { resource?: unknown }).resource;
  if (typeof resource === 'string' && isPaymentEvent) {
    // Si viene tipo URL, intentamos extraer el id asociado a "payments/{id}".
    const matchPayments = resource.match(/payments\/(\d+)\b/);
    if (matchPayments) return matchPayments[1];
    const matchTrailing = resource.match(/(\d+)\s*$/);
    if (matchTrailing) return matchTrailing[1];
  }
  return undefined;
}

function getMercadopagoErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const o = err as Record<string, unknown>;
  if (typeof o.status === 'number') return o.status;
  return undefined;
}

/** MP a veces tarda en indexar el pago; 404 también puede ser token test vs prod distinto al cobro. */
async function getPaymentForWebhook(paymentClient: Payment, paymentId: string) {
  const delaysMs = [0, 2000, 5000];
  for (let i = 0; i < delaysMs.length; i++) {
    if (delaysMs[i] > 0) await new Promise((r) => setTimeout(r, delaysMs[i]));
    try {
      return await paymentClient.get({ id: Number(paymentId) });
    } catch (err: unknown) {
      const status = getMercadopagoErrorStatus(err);
      const last = i === delaysMs.length - 1;
      const retryable = !last && (status === 404 || status === 429 || (status != null && status >= 500));
      if (retryable) {
        console.warn(
          `[Webhook MP] reintento ${i + 2}/${delaysMs.length} pago ${paymentId} (HTTP ${String(status)})`
        );
        continue;
      }
      console.error('[Webhook MP] no se pudo obtener el pago', paymentId, err);
      if (status === 404) {
        console.error(
          '[Webhook MP] 404: el access token no encuentra ese pago. Revisá TEST vs PROD (TEST-… = sandbox, APP_USR… = producción), misma cuenta MP que cobró la seña, y que el token no tenga espacios al pegarlo.'
        );
      }
      return null;
    }
  }
  return null;
}

/**
 * Preferencia de pago por la seña (Checkout Pro / Wallet Brick). El turno queda pending_payment hasta el webhook.
 */
router.post('/sena', async (req, res) => {
  const config = getMpConfig();
  if (!config) {
    return res
      .status(503)
      .json({ error: 'Mercado Pago no está configurado (MERCADOPAGO_ACCESS_TOKEN).' });
  }
  const t = (process.env.MERCADOPAGO_ACCESS_TOKEN ?? '').trim();
  console.log(`[MP] preference.create usando token last6: ${t.slice(-6)}`);

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

  const uid = userId != null ? Number(userId) : NaN;
  if (!Number.isFinite(uid) || uid <= 0) {
    return res.status(401).json({ error: 'Tenés que iniciar sesión para confirmar el turno.' });
  }

  const shop = await getShopSettings();
  if (isPastCalendarDateInArgentina(date)) {
    return res.status(400).json({ error: 'No podés reservar en una fecha pasada.' });
  }
  if (hoursUntilAppointmentStart(date, time) <= 0) {
    return res.status(400).json({ error: 'Elegí un horario futuro.' });
  }
  if (!isDateOnOpenWeekday(date, shop.openWeekdays)) {
    return res.status(400).json({ error: 'El local no atiende ese día. Elegí otra fecha.' });
  }
  if (isDateClosed(date, shop.closedDates)) {
    return res.status(400).json({ error: 'La barbería está cerrada en esa fecha. Elegí otra fecha.' });
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

  /** Atajo: si el cliente está exento de seña (manual o abono), confirmamos sin Mercado Pago. */
  const requesterUser = await findUserById(uid);
  if (requesterUser && (await isClientDepositExempt(uid))) {
    let confirmed;
    try {
      confirmed = await repo.createAppointment({
        name,
        phone,
        service,
        serviceId: serviceId ?? undefined,
        barberId,
        date,
        time,
        durationMinutes,
        status: 'scheduled',
        depositPaid: false,
        userId: uid,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo crear el turno';
      return res.status(409).json({ error: msg });
    }

    res.status(201).json({
      exempt: true,
      appointmentId: confirmed.id,
    });

    void notifyShopPhoneAppointmentCreated(confirmed);

    void (async () => {
      try {
        if (isRealClientEmail(requesterUser.email)) {
          await sendAppointmentScheduledEmail(requesterUser.email, confirmed);
        }
      } catch (err) {
        console.error('[Email] No se pudo enviar confirmación a cliente exento', err);
      }
    })();
    return;
  }

  let pending;
  const depositMinutes = getPendingPaymentMinutes();
  const paymentDueAt = paymentDueAtFromNow(depositMinutes);

  const serviceEntity = serviceId ? await getServiceById(serviceId) : null;
  const servicePriceArs = parseArsAmount(serviceEntity?.price ?? service);
  const activePromos = await getActivePromotions();
  const bookingPromo = resolveBookingPromotion(activePromos, date);
  const depositCalc =
    servicePriceArs != null
      ? calculateBookingDepositArs(servicePriceArs, DEPOSIT_PERCENT, bookingPromo)
      : null;

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
      userId: uid,
      promotionId: depositCalc?.promotionId ?? undefined,
      promotionFullyPaid: depositCalc?.promotionFullyPaid ?? false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo reservar temporalmente el horario';
    return res.status(409).json({ error: msg });
  }

  let pref: { preferenceId: string; url?: string };
  try {
    pref = await createMercadoPagoSenaPreference(config, {
      appointmentId: pending.id,
      name,
      phone,
      service,
      serviceId: serviceId ?? '',
      barberId,
      date,
      time,
      durationMinutes,
      userId: uid,
    });
  } catch (e) {
    console.error('Mercado Pago preference.create:', e);
    await repo.updateAppointment(pending.id, { status: 'cancelled' });
    return res.status(502).json({
      error: 'No se pudo iniciar el pago con Mercado Pago. Revisá credenciales y montos.',
    });
  }

  res.json({
    preferenceId: pref.preferenceId,
    ...(pref.url ? { url: pref.url } : {}),
    appointmentId: pending.id,
    paymentDueAt,
  });

  void (async () => {
    try {
      const user = await findUserById(uid);
      if (user && isRealClientEmail(user.email)) {
        await sendDepositPendingEmail(user.email, pending, {
          paymentUrl: pref.url,
          paymentDueAt,
          depositMinutes,
        });
      }
    } catch (err) {
      console.error('[Email] No se pudo enviar aviso de seña pendiente', err);
    }
  })();
});

/**
 * Nueva preferencia de seña para un turno ya creado (pending_payment), p. ej. desde el perfil.
 * No extiende el plazo: sigue valiendo el payment_due_at original.
 */
router.post('/sena/:appointmentId', requireAuth, async (req, res) => {
  const config = getMpConfig();
  if (!config) {
    return res
      .status(503)
      .json({ error: 'Mercado Pago no está configurado (MERCADOPAGO_ACCESS_TOKEN).' });
  }
  const authReq = req as AuthRequest;
  const appointmentId = req.params.appointmentId;

  try {
    await repo.expireStalePendingAppointments();
    const app = await repo.getAppointmentById(appointmentId);
    if (!app || app.userId !== authReq.user!.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (app.status !== 'pending_payment' || app.depositPaid) {
      return res.status(400).json({ error: 'Este turno no está esperando el pago de la seña.' });
    }
    if (!app.paymentDueAt) {
      return res.status(400).json({ error: 'Turno sin plazo de pago registrado.' });
    }
    const dueMs = Date.parse(String(app.paymentDueAt).replace(' ', 'T') + 'Z');
    if (!Number.isFinite(dueMs) || dueMs <= Date.now()) {
      return res.status(400).json({
        error: 'El plazo para pagar la seña venció. Volvé a reservar desde la web.',
      });
    }
    if (!app.barberId) {
      return res.status(400).json({ error: 'Turno sin barbero asignado.' });
    }

    const durationMinutes =
      app.durationMinutes ?? (await repo.resolveDurationMinutes(app.serviceId, app.service));

    /** Atajo: si el cliente está exento de seña (manual o abono), confirmamos sin Mercado Pago. */
    const requesterUser = await findUserById(authReq.user!.id);
    if (requesterUser && (await isClientDepositExempt(authReq.user!.id))) {
      const updated = await repo.markAppointmentScheduledByExempt(app.id);
      const finalApp = updated ?? app;
      res.json({ exempt: true, appointmentId: finalApp.id });
      void notifyShopPhoneAppointmentCreated(finalApp);
      void (async () => {
        try {
          if (isRealClientEmail(requesterUser.email)) {
            await sendAppointmentScheduledEmail(requesterUser.email, finalApp);
          }
        } catch (err) {
          console.error('[Email] No se pudo enviar confirmación a cliente exento (retry)', err);
        }
      })();
      return;
    }

    let pref: { preferenceId: string; url?: string };
    try {
    pref = await createMercadoPagoSenaPreference(config, {
      appointmentId: app.id,
      name: app.name,
      phone: app.phone,
      service: app.service,
      serviceId: app.serviceId ?? '',
      barberId: app.barberId,
      date: app.date,
      time: app.time,
      durationMinutes,
      userId: authReq.user!.id,
      returnToProfile: true,
    });
    } catch (e) {
      console.error('Mercado Pago preference.create (retry):', e);
      const msg = e instanceof Error ? e.message : 'No se pudo iniciar el pago';
      return res.status(502).json({ error: msg });
    }

    res.json({
      preferenceId: pref.preferenceId,
      ...(pref.url ? { url: pref.url } : {}),
      appointmentId: app.id,
      paymentDueAt: app.paymentDueAt,
    });

    void (async () => {
      try {
        const user = await findUserById(authReq.user!.id);
        if (user && isRealClientEmail(user.email)) {
          await sendDepositPendingEmail(user.email, app, {
            paymentUrl: pref.url,
            paymentDueAt: app.paymentDueAt,
            depositMinutes: getPendingPaymentMinutes(),
          });
        }
      } catch (err) {
        console.error('[Email] No se pudo reenviar aviso de seña pendiente', err);
      }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al preparar el pago' });
  }
});

/**
 * Checkout de abono (Checkout Pro). Al aprobar el pago, el webhook asigna el plan al cliente.
 */
router.post('/subscription', requireAuth, async (req, res) => {
  const config = getMpConfig();
  if (!config) {
    return res
      .status(503)
      .json({ error: 'Mercado Pago no está configurado (MERCADOPAGO_ACCESS_TOKEN).' });
  }

  const authReq = req as AuthRequest;
  const { planId } = req.body as { planId?: string };
  if (!planId || typeof planId !== 'string' || !planId.trim()) {
    return res.status(400).json({ error: 'Se requiere el plan de abono' });
  }

  const plan = await getSubscriptionPlanById(planId.trim());
  if (!plan || !plan.active) {
    return res.status(404).json({ error: 'Plan de abono no encontrado o inactivo' });
  }

  const amountArs = parseArsAmount(plan.monthlyPrice);
  if (!amountArs) {
    return res.status(400).json({ error: 'El precio del abono no es válido para cobrar online.' });
  }

  try {
    const pref = await createMercadoPagoSubscriptionPreference(config, {
      planId: plan.id,
      planName: plan.name,
      amountArs,
      userId: authReq.user!.id,
    });
    res.json({
      preferenceId: pref.preferenceId,
      ...(pref.url ? { url: pref.url } : {}),
      planId: plan.id,
    });
  } catch (e) {
    console.error('Mercado Pago preference.create (subscription):', e);
    const msg = e instanceof Error ? e.message : 'No se pudo iniciar el pago';
    return res.status(502).json({ error: msg });
  }
});

/**
 * Checkout de productos (Checkout Pro). Retiro en el local tras pagar online.
 */
router.post('/products', requireAuth, async (req, res) => {
  const config = getMpConfig();
  if (!config) {
    return res
      .status(503)
      .json({ error: 'Mercado Pago no está configurado (MERCADOPAGO_ACCESS_TOKEN).' });
  }

  const authReq = req as AuthRequest;
  const { items } = req.body as { items?: { productId?: string; quantity?: number }[] };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agregá al menos un producto al pedido' });
  }

  let resolved;
  try {
    resolved = await resolveProductOrderLines(
      items.map((i) => ({ productId: String(i.productId ?? ''), quantity: Number(i.quantity) }))
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Pedido inválido';
    return res.status(400).json({ error: msg });
  }

  let order;
  try {
    order = await createProductOrder({
      userId: authReq.user!.id,
      items: resolved.lines,
      totalArs: resolved.totalArs,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No se pudo crear el pedido' });
  }

  try {
    const pref = await createMercadoPagoProductOrderPreference(config, {
      orderId: order.id,
      userId: authReq.user!.id,
      items: resolved.lines.map((line) => ({
        id: line.productId,
        title: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    });
    res.json({
      preferenceId: pref.preferenceId,
      ...(pref.url ? { url: pref.url } : {}),
      orderId: order.id,
      totalArs: resolved.totalArs,
    });
  } catch (e) {
    console.error('Mercado Pago preference.create (products):', e);
    const msg = e instanceof Error ? e.message : 'No se pudo iniciar el pago';
    return res.status(502).json({ error: msg });
  }
});

export default router;

export async function mercadopagoWebhook(req: Request, res: Response): Promise<void> {
  const paymentId = extractPaymentId(req);
  const q = req.query as Record<string, unknown>;
  const body = req.body as Record<string, unknown> | null | undefined;
  const action = body && typeof body === 'object' ? (body as any).action : undefined;
  const topic = q?.topic;
  const isPaymentEvent =
    topic === 'payment' ||
    (typeof action === 'string' && action.startsWith('payment.')) ||
    (typeof (body as any)?.type === 'string' && (body as any).type === 'payment');

  // Debug: ayuda a confirmar si estamos parseando bien el id que luego consultamos con el token.
  // No logueamos datos sensibles; solo identificadores y campos de routing del webhook.
  try {
    const q = req.query as Record<string, unknown>;
    const body = req.body as Record<string, unknown> | null | undefined;
    const topic = q.topic;
    const queryId = q.id;
    const dataId = body && typeof body === 'object' ? (body as any).data?.id : undefined;
    const dataType = body && typeof body === 'object' ? (body as any).data?.type : undefined;
    const resource = body && typeof body === 'object' ? (body as any).resource : undefined;
    const eventId = (body as any)?.id;
    const action = (body as any)?.action;

    console.log(
      `[Webhook MP] parse: topic=${String(topic)} queryId=${String(
        queryId
      )} dataType=${String(dataType)} dataId=${String(
        dataId
      )} resource=${typeof resource === 'string' ? resource.slice(0, 40) : typeof resource} action=${String(
        action
      )} eventId=${String(eventId)} extractedPaymentId=${paymentId}`
    );
  } catch {
    /* ignore debug failures */
  }

  if (!paymentId) {
    // Para topics que no son de pago (ej. merchant_order), ignoramos el evento sin provocar reintentos.
    if (!isPaymentEvent) {
      res.status(200).send('OK');
      return;
    }
    res.status(400).send('Sin id de pago');
    return;
  }

  res.status(200).send('OK');

  const config = getMpConfig();
  if (!config) {
    console.error('Webhook MP: MERCADOPAGO_ACCESS_TOKEN no configurado');
    return;
  }
  const t = (process.env.MERCADOPAGO_ACCESS_TOKEN ?? '').trim();
  console.log(`[MP] webhook usando token last6: ${t.slice(-6)}`);

  const paymentClient = new Payment(config);
  const payment = await getPaymentForWebhook(paymentClient, paymentId);
  if (!payment) return;

  if (payment.status !== 'approved') return;

  const existingSubPayment = await getSubscriptionPaymentByMpId(paymentId);
  if (existingSubPayment) return;

  const existingProductPayment = await getProductPaymentByMpId(paymentId);
  if (existingProductPayment) return;

  const productRef = parseProductOrderRef(
    payment.external_reference,
    payment.metadata as Record<string, unknown> | undefined
  );
  if (productRef) {
    const userId = parseInt(productRef.u, 10);
    const orderId = parseInt(productRef.o, 10);
    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(orderId) || orderId <= 0) {
      console.error('Webhook MP: pedido de productos sin ids válidos', paymentId);
      return;
    }
    const inserted = await recordProductPayment({
      mercadopagoPaymentId: paymentId,
      orderId,
      userId,
    });
    if (!inserted) return;
    const paid = await markProductOrderPaid(orderId, paymentId);
    if (paid?.status === 'paid') {
      let points = 0;
      for (const line of paid.items) {
        try {
          await decrementProductStock(line.productId, line.quantity);
        } catch (e) {
          console.error('[Webhook MP] no se pudo descontar stock', line.productId, e);
        }
        const product = await getShopProductById(line.productId);
        if (product?.pointsReward) points += product.pointsReward * line.quantity;
      }
      if (points > 0) {
        try {
          await incrementClientPoints(userId, points);
        } catch (e) {
          console.error('[Webhook MP] no se pudieron sumar puntos por compra', e);
        }
      }
      console.log(`[Webhook MP] pedido productos pagado order=${orderId} user=${userId}`);
    }
    return;
  }

  const subRef = parseSubscriptionRef(
    payment.external_reference,
    payment.metadata as Record<string, unknown> | undefined
  );
  if (subRef) {
    const userId = parseInt(subRef.u, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      console.error('Webhook MP: abono sin userId válido', paymentId);
      return;
    }
    const plan = await getSubscriptionPlanById(subRef.p);
    if (!plan || !plan.active) {
      console.error('Webhook MP: plan de abono inválido', subRef.p);
      return;
    }
    const inserted = await recordSubscriptionPayment({
      mercadopagoPaymentId: paymentId,
      userId,
      planId: subRef.p,
    });
    if (!inserted) return;
    try {
      await assignSubscriptionPlanToClient(userId, subRef.p);
      console.log(`[Webhook MP] abono asignado user=${userId} plan=${subRef.p}`);
      void notifyClientSubscriptionActivated(userId);
    } catch (e) {
      console.error('Webhook MP: no se pudo asignar abono', e);
    }
    return;
  }

  const depositAmountArs = parseMercadoPagoTransactionAmountArs(payment);

  const existingByMp = await repo.getAppointmentByMercadopagoPaymentId(paymentId);
  if (existingByMp) {
    if (depositAmountArs != null && (!existingByMp.depositAmountArs || existingByMp.depositAmountArs <= 0)) {
      await repo.setAppointmentDepositAmountArs(existingByMp.id, depositAmountArs);
    }
    return;
  }

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
    const updated = await repo.markAppointmentPaidAndScheduled(
      existingByRefId.id,
      paymentId,
      depositAmountArs
    );
    if (updated) {
      void notifyBarberByWhatsappOnDepositPaid(updated);
      void notifyShopPhoneAppointmentCreated(updated);
      void notifyClientDepositConfirmed(updated);
    }
    return;
  }

  try {
    const activePromos = await getActivePromotions();
    const bookingPromo = resolveBookingPromotion(activePromos, ref.d);
    const serviceEntity = ref.i ? await getServiceById(ref.i) : null;
    const servicePriceArs = parseArsAmount(serviceEntity?.price ?? ref.s);
    const depositCalc =
      servicePriceArs != null
        ? calculateBookingDepositArs(servicePriceArs, DEPOSIT_PERCENT, bookingPromo)
        : null;

    const created = await repo.createAppointment({
      name: ref.n,
      phone: ref.p,
      service: ref.s,
      serviceId: ref.i || undefined,
      barberId: ref.b,
      date: ref.d,
      time: ref.t,
      durationMinutes: ref.m,
      depositPaid: true,
      depositAmountArs: depositAmountArs ?? undefined,
      mercadopagoPaymentId: paymentId,
      promotionId: depositCalc?.promotionId ?? undefined,
      promotionFullyPaid: depositCalc?.promotionFullyPaid ?? false,
      ...(userId != null && !Number.isNaN(userId) ? { userId } : {}),
    });
    void notifyBarberByWhatsappOnDepositPaid(created);
    void notifyShopPhoneAppointmentCreated(created);
    void notifyClientDepositConfirmed(created);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ER_DUP_ENTRY') return;
    console.error('Webhook MP: no se pudo crear el turno (revisá cupo / reembolso)', e);
  }
}

async function notifyClientDepositConfirmed(app: { id: string; userId?: number; name: string }): Promise<void> {
  try {
    if (app.userId == null || !Number.isFinite(Number(app.userId))) return;
    const user = await findUserById(Number(app.userId));
    if (!user || !isRealClientEmail(user.email)) return;
    const full = await repo.getAppointmentById(app.id);
    if (!full) return;
    if (!full.depositPaid) {
      await sendAppointmentScheduledEmail(user.email, full);
      return;
    }
    await sendDepositConfirmedEmail(user.email, full);
  } catch (err) {
    console.error('[Email] No se pudo enviar confirmación de seña al cliente', err);
  }
}

/** Al arranque: indica si el token es sandbox o producción (no muestra el secreto). */
export function logMercadoPagoEnvHint(): void {
  const raw = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!raw?.trim()) {
    console.warn('[MP] MERCADOPAGO_ACCESS_TOKEN no está definido.');
    return;
  }
  const t = raw.trim();
  if (t.startsWith('TEST-')) {
    console.log(
      `[MP] Token: SANDBOX (TEST-). Solo verás pagos de prueba; un pago real da 404 al consultar el id. (last6: ${t.slice(
        -6
      )})`
    );
  } else if (t.startsWith('APP_USR-')) {
    console.log(
      `[MP] Token: PRODUCCIÓN (APP_USR-). (last6: ${t.slice(-6)})`
    );
  } else {
    console.warn('[MP] Token: prefijo inesperado (copiá Access Token de Credenciales, no la Public Key).');
  }
}
