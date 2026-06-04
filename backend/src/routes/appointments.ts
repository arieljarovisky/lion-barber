import { Router } from 'express';
import * as repo from '../repositories/appointments.js';
import { getShopSettings } from '../repositories/shopSettings.js';
import { requireAuth, requireStaffOrAdmin, optionalAuth, type AuthRequest } from '../middleware/auth.js';
import {
  canClientCancelAppointment,
  canClientRescheduleAppointment,
  DEPOSIT_REFUND_MIN_HOURS,
  hoursUntilAppointmentStart,
  isDateClosed,
  isDateOnOpenWeekday,
  isPastCalendarDateInArgentina,
} from '../appointmentRules.js';
import { refundPaymentTotal } from '../mercadopagoRefund.js';
import {
  notifyShopPhoneAppointmentCancelled,
  notifyShopPhoneAppointmentCreated,
  notifyShopPhoneAppointmentRescheduled,
} from '../services/mobileNotifications.js';
import { isRealClientEmail, sendAppointmentScheduledEmail } from '../services/email.js';
import { findUserById } from '../repositories/users.js';
import type { Appointment, AppointmentProductLine } from '../types.js';
import { parseServicePaymentMethod, parseServicePaymentSplits } from '../servicePaymentMethod.js';
import { parseTipAmountBody } from '../tipAmount.js';
import type { ServicePaymentSplit } from '../types.js';
import { MAX_APPOINTMENT_PRODUCT_LINES } from '../appointmentProducts.js';
import { getShopProductById } from '../repositories/shopProducts.js';
import { parseArsAmount } from '../arsAmount.js';
import { assertCanModifyAppointment, isSuperAdminUser } from '../services/appointmentModifyPermission.js';
import { isDailyCashCloseDate } from '../repositories/dailyCashClose.js';
import { syncSubscriptionCutWithPayment } from '../services/clientSubscription.js';

const PAYMENT_PATCH_KEYS = new Set([
  'servicePaymentSplits',
  'servicePaymentMethod',
  'tipAmount',
  'products',
]);

function isPaymentOnlyPatch(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body).filter((k) => body[k] !== undefined);
  return keys.length > 0 && keys.every((k) => PAYMENT_PATCH_KEYS.has(k));
}

async function buildPaymentFieldsPatch(
  existing: Appointment,
  body: Record<string, unknown>
): Promise<{ payload: Partial<Appointment> } | { error: string; status: number }> {
  const payload: Partial<Appointment> = {};
  if ('tipAmount' in body) {
    try {
      payload.tipAmount = parseTipAmountBody(body.tipAmount);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Propina inválida', status: 400 };
    }
  }
  if ('servicePaymentSplits' in body) {
    const parsed = parseSplitsBodyField(body.servicePaymentSplits);
    if (
      body.servicePaymentSplits != null &&
      parsed === null &&
      !(Array.isArray(body.servicePaymentSplits) && body.servicePaymentSplits.length === 0)
    ) {
      return { error: 'Cobros por método no válidos', status: 400 };
    }
    try {
      await syncSubscriptionCutWithPayment(existing, parsed ?? null);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo aplicar el abono', status: 400 };
    }
    payload.servicePaymentSplits = parsed ?? null;
  }
  if ('servicePaymentMethod' in body) {
    const raw = body.servicePaymentMethod;
    if (raw === null || raw === '') {
      payload.servicePaymentMethod = null;
    } else {
      const parsed = parseServicePaymentMethod(raw);
      if (!parsed) {
        return { error: 'Método de pago no válido', status: 400 };
      }
      payload.servicePaymentMethod = parsed;
    }
  }
  if ('products' in body) {
    try {
      payload.products = (await resolveProductsBodyField(body.products)) ?? null;
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Productos no válidos', status: 400 };
    }
  }
  return { payload };
}

function parseSplitsBodyField(raw: unknown): ServicePaymentSplit[] | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const parsed = parseServicePaymentSplits(raw);
  if (!parsed) {
    if (Array.isArray(raw) && raw.length === 0) return null;
    return null;
  }
  return parsed;
}

/**
 * Convierte el body `{ products: [{ productId, quantity }] }` a `AppointmentProductLine[]`,
 * resolviendo el nombre y precio desde el catálogo `shop_products`.
 * Devuelve `null` si el body trae lista vacía (o no enviada con un `null` explícito).
 * Tira si:
 *  - viene con tipos inválidos,
 *  - se excede `MAX_APPOINTMENT_PRODUCT_LINES`,
 *  - un producto no existe o no tiene precio en pesos cargado.
 */
async function resolveProductsBodyField(
  raw: unknown
): Promise<AppointmentProductLine[] | null | undefined> {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!Array.isArray(raw)) throw new Error('Productos no válidos');
  if (raw.length === 0) return null;
  if (raw.length > MAX_APPOINTMENT_PRODUCT_LINES) {
    throw new Error(`Demasiados productos (máx ${MAX_APPOINTMENT_PRODUCT_LINES}).`);
  }
  const merged = new Map<string, number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      throw new Error('Productos no válidos');
    }
    const obj = item as Record<string, unknown>;
    const productId = typeof obj.productId === 'string' ? obj.productId.trim() : '';
    const qty = Math.floor(Number(obj.quantity));
    if (!productId) throw new Error('Falta productId en alguna línea.');
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('La cantidad debe ser un entero ≥ 1 en cada producto.');
    }
    merged.set(productId, (merged.get(productId) ?? 0) + qty);
  }
  const lines: AppointmentProductLine[] = [];
  for (const [productId, quantity] of merged.entries()) {
    const product = await getShopProductById(productId);
    if (!product) throw new Error(`Producto «${productId}» no existe.`);
    const unit = parseArsAmount(product.unitPrice);
    if (unit == null || unit <= 0) {
      throw new Error(`El producto «${product.name}» no tiene precio cargado.`);
    }
    const unitPrice = Math.round(unit);
    lines.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      subtotal: unitPrice * quantity,
    });
  }
  return lines;
}

const router = Router();

function parseDurationMinutes(q: unknown): number {
  const n = typeof q === 'string' ? parseInt(q, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

router.get('/availability/any', async (req, res) => {
  const { date } = req.query;
  const durationMinutes = parseDurationMinutes(req.query.durationMinutes);
  if (typeof date !== 'string') {
    return res.status(400).json({ error: 'Se requiere date' });
  }
  try {
    const slots = await repo.getAvailableSlotsAnyBarber(date, durationMinutes);
    const earliest = await repo.getEarliestAvailableAnyBarber(date, durationMinutes);
    res.json({ slots, earliest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular disponibilidad' });
  }
});

router.get('/availability', async (req, res) => {
  const { date, barberId } = req.query;
  const durationMinutes = parseDurationMinutes(req.query.durationMinutes);
  if (typeof date !== 'string' || typeof barberId !== 'string') {
    return res.status(400).json({ error: 'Se requieren date y barberId' });
  }
  try {
    const slots = await repo.getAvailableSlots(date, barberId, durationMinutes);
    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular disponibilidad' });
  }
});

router.get('/', optionalAuth, async (req, res) => {
  const { date, barberId } = req.query;
  const u = (req as AuthRequest).user;
  const staffBid = u?.role === 'staff' ? u.barberId ?? null : null;

  try {
    if (u?.role === 'staff' && !staffBid) {
      return res.status(403).json({
        error:
          'Tu cuenta de barbero no está vinculada. Pedile al administrador que te invite de nuevo indicando tu nombre en la agenda.',
      });
    }

    if (date && typeof date === 'string') {
      if (staffBid) {
        return res.json(await repo.getAppointmentsByBarber(staffBid, date));
      }
      if (barberId && typeof barberId === 'string') {
        return res.json(await repo.getAppointmentsByBarber(barberId, date));
      }
      return res.json(await repo.getAppointmentsByDate(date));
    }
    if (barberId && typeof barberId === 'string') {
      if (staffBid && barberId !== staffBid) {
        return res.status(403).json({ error: 'No autorizado' });
      }
      return res.json(await repo.getAppointmentsByBarber(barberId));
    }
    if (staffBid) {
      return res.json(await repo.getAppointmentsByBarber(staffBid));
    }
    if (u?.role === 'admin') {
      return res.json(await repo.getAllAppointments());
    }
    return res.status(401).json({ error: 'Iniciá sesión para ver la agenda' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const settings = await getShopSettings();
    const list = await repo.getAppointmentsByUserId(authReq.user!.id);
    const enriched = list.map((a) => ({
      ...a,
      canCancel: canClientCancelAppointment(a).ok,
      canReschedule: canClientRescheduleAppointment(a, settings.cutoffHours).ok,
    }));
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mis citas' });
  }
});

router.post('/:id/cancel', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  const id = req.params.id;
  try {
    const app = await repo.getAppointmentById(id);
    if (!app || app.userId !== authReq.user!.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const check = canClientCancelAppointment(app);
    if (!check.ok) {
      return res.status(403).json({ error: check.reason ?? 'No podés cancelar este turno' });
    }

    const hoursLeft = hoursUntilAppointmentStart(app.date, app.time);
    let cancelNotice: 'refund_processed' | 'deposit_retained_short_notice' | 'no_deposit' = 'no_deposit';

    if (app.depositPaid && app.mercadopagoPaymentId) {
      if (hoursLeft >= DEPOSIT_REFUND_MIN_HOURS) {
        const refund = await refundPaymentTotal(app.mercadopagoPaymentId);
        if (!refund.ok) {
          return res.status(502).json({ error: refund.error });
        }
        cancelNotice = 'refund_processed';
      } else {
        cancelNotice = 'deposit_retained_short_notice';
      }
    }

    const updated = await repo.cancelAppointmentByUser(id, authReq.user!.id);
    if (!updated) return res.status(404).json({ error: 'Cita no encontrada' });
    void notifyShopPhoneAppointmentCancelled(updated, { byClient: true });
    res.json({ ...updated, cancelNotice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cancelar' });
  }
});

router.post('/:id/reschedule', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  const id = req.params.id;
  const { date, time } = req.body as { date?: string; time?: string };
  if (!date || !time) {
    return res.status(400).json({ error: 'Se requiere date y time' });
  }
  try {
    const app = await repo.getAppointmentById(id);
    if (!app || app.userId !== authReq.user!.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const settings = await getShopSettings();
    const check = canClientRescheduleAppointment(app, settings.cutoffHours);
    if (!check.ok) {
      return res.status(403).json({ error: check.reason ?? 'No podés reprogramar este turno' });
    }
    if (!isDateOnOpenWeekday(date, settings.openWeekdays)) {
      return res.status(400).json({ error: 'El local no atiende ese día. Elegí otra fecha.' });
    }
    if (isDateClosed(date, settings.closedDates)) {
      return res.status(400).json({ error: 'La barbería está cerrada en esa fecha. Elegí otra.' });
    }
    const barberId = app.barberId;
    if (!barberId) {
      return res.status(400).json({ error: 'Turno sin barbero asignado' });
    }
    const durationMinutes =
      app.durationMinutes ?? (await repo.resolveDurationMinutes(app.serviceId, app.service));
    await repo.assertNoOverlap(barberId, date, time, durationMinutes, id);
    const updated = await repo.updateAppointment(id, { date, time });
    if (!updated) return res.status(404).json({ error: 'Cita no encontrada' });
    void notifyShopPhoneAppointmentRescheduled(app, updated);
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al reprogramar';
    const code = /ocupado|solapa/i.test(msg) ? 409 : 500;
    if (code === 500) console.error(err);
    res.status(code).json({ error: msg });
  }
});

router.get('/:id', async (req, res) => {
  const app = await repo.getAppointmentById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(app);
});

router.post('/', optionalAuth, async (req, res) => {
  const { name, phone, service, serviceId, barber, barberId, date, time, userId, depositPaid, durationMinutes } =
    req.body;
  const u = (req as AuthRequest).user;
  const isStaffOrAdmin = u?.role === 'admin' || u?.role === 'staff';
  const phoneTrim = typeof phone === 'string' ? phone.trim() : '';
  if (!name || !service || !date || !time) {
    return res.status(400).json({ error: 'Faltan campos: name, service, date, time' });
  }
  if (!isStaffOrAdmin && !phoneTrim) {
    return res.status(400).json({ error: 'Falta el teléfono de contacto' });
  }
  if (!barberId) {
    return res.status(400).json({ error: 'Falta barberId (o elige "Cualquier barbero")' });
  }
  if (u?.role === 'staff') {
    const bid = u.barberId;
    if (!bid || String(barberId) !== bid) {
      return res.status(403).json({ error: 'Solo podés cargar turnos en tu propia agenda' });
    }
  }
  try {
    const shop = await getShopSettings();
    if (!isStaffOrAdmin) {
      if (isPastCalendarDateInArgentina(String(date))) {
        return res.status(400).json({ error: 'No podés cargar un turno en una fecha pasada.' });
      }
      if (hoursUntilAppointmentStart(String(date), String(time)) <= 0) {
        return res.status(400).json({ error: 'Elegí un horario futuro.' });
      }
    }
    if (!isDateOnOpenWeekday(date, shop.openWeekdays)) {
      return res.status(400).json({ error: 'El local no atiende ese día.' });
    }
    if (isDateClosed(date, shop.closedDates)) {
      return res.status(400).json({ error: 'La barbería está cerrada en esa fecha.' });
    }
    if (isStaffOrAdmin && u && !isSuperAdminUser(u)) {
      if (await isDailyCashCloseDate(String(date))) {
        return res.status(403).json({
          error: 'El día ya fue cerrado. Solo un super administrador puede cargar turnos.',
        });
      }
    }
    const created = await repo.createAppointment({
      name,
      phone: phoneTrim,
      service,
      serviceId: serviceId != null ? String(serviceId) : undefined,
      barber,
      barberId: String(barberId),
      date,
      time,
      userId: userId != null ? Number(userId) : undefined,
      depositPaid: Boolean(depositPaid),
      ...(durationMinutes != null ? { durationMinutes: Number(durationMinutes) } : {}),
      ...(isStaffOrAdmin && u ? { createdByUserId: u.id } : {}),
    });
    if ((created.status ?? 'scheduled') === 'scheduled') {
      void notifyShopPhoneAppointmentCreated(created);
      void notifyClientAppointmentScheduled(created);
    }
    res.status(201).json(created);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al crear cita';
    const code = /ocupado|solapa|No hay barbero/i.test(msg) ? 409 : 500;
    if (code === 500) console.error(err);
    res.status(code).json({ error: msg });
  }
});

router.patch('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const existing = await repo.getAppointmentById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cita no encontrada' });
    const body = req.body as Record<string, unknown>;
    const paymentOnly = isPaymentOnlyPatch(body);

    if (paymentOnly) {
      if ((existing.status ?? 'scheduled') !== 'scheduled') {
        return res.status(400).json({ error: 'Solo se pueden cargar cobros en turnos confirmados.' });
      }
    } else {
      if (authReq.user!.role === 'staff') {
        const bid = authReq.user!.barberId;
        if (!bid || existing.barberId !== bid) {
          return res.status(403).json({ error: 'No autorizado' });
        }
      }
      try {
        await assertCanModifyAppointment(authReq.user!, existing);
      } catch (e) {
        return res.status(403).json({ error: e instanceof Error ? e.message : 'No autorizado' });
      }
    }

    let payload: Partial<Appointment>;
    if (authReq.user!.role === 'staff' && paymentOnly) {
      const built = await buildPaymentFieldsPatch(existing, body);
      if ('error' in built) return res.status(built.status).json({ error: built.error });
      payload = built.payload;
    } else if (authReq.user!.role === 'staff') {
      payload = {};
      const built = await buildPaymentFieldsPatch(existing, body);
      if ('error' in built) return res.status(built.status).json({ error: built.error });
      Object.assign(payload, built.payload);
      const allowedStaff = ['name', 'phone', 'service', 'serviceId', 'date', 'time', 'durationMinutes'];
      for (const key of allowedStaff) {
        if (key in body) (payload as Record<string, unknown>)[key] = body[key];
      }
    } else {
      payload = { ...body } as Partial<Appointment>;
      delete (payload as Record<string, unknown>).servicePaymentSplits;
      delete (payload as Record<string, unknown>).servicePaymentMethod;
      delete (payload as Record<string, unknown>).products;
      const built = await buildPaymentFieldsPatch(existing, body);
      if ('error' in built) return res.status(built.status).json({ error: built.error });
      Object.assign(payload, built.payload);
    }
    const updated = await repo.updateAppointment(req.params.id, {
      ...payload,
      updatedByUserId: authReq.user!.id,
    });
    if (!updated) return res.status(404).json({ error: 'Cita no encontrada' });
    const refreshed =
      'servicePaymentSplits' in body ? await repo.getAppointmentById(req.params.id) : null;
    res.json(refreshed ?? updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar';
    const code = /ocupado|solapa/i.test(msg) ? 409 : 500;
    if (code === 500) console.error(err);
    res.status(code).json({ error: msg });
  }
});

router.delete('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const authReq = req as AuthRequest;
  const existing = await repo.getAppointmentById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cita no encontrada' });
  if (authReq.user!.role === 'staff') {
    const bid = authReq.user!.barberId;
    if (!bid || existing.barberId !== bid) {
      return res.status(403).json({ error: 'No autorizado' });
    }
  }
  try {
    await assertCanModifyAppointment(authReq.user!, existing);
  } catch (e) {
    return res.status(403).json({ error: e instanceof Error ? e.message : 'No autorizado' });
  }
  const ok = await repo.deleteAppointment(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Cita no encontrada' });
  void notifyShopPhoneAppointmentCancelled(existing, { byClient: false });
  res.status(204).send();
});

async function notifyClientAppointmentScheduled(app: Appointment): Promise<void> {
  try {
    if (app.userId == null || !Number.isFinite(Number(app.userId))) {
      console.warn(
        `[Email] OMITIDO: turno ${app.id} sin userId vinculado (cliente no logueado o carga manual sin cuenta)`
      );
      return;
    }
    const user = await findUserById(Number(app.userId));
    if (!user) {
      console.warn(`[Email] OMITIDO: usuario ${app.userId} no encontrado en DB`);
      return;
    }
    if (!isRealClientEmail(user.email)) return;
    console.log(`[Email] Disparando aviso de turno agendado a userId=${user.id} email=${user.email}`);
    await sendAppointmentScheduledEmail(user.email, app);
  } catch (err) {
    console.error('[Email] No se pudo enviar aviso de turno agendado', err);
  }
}

export default router;
