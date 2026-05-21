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
import type { Appointment } from '../types.js';
import { parseServicePaymentMethod, parseServicePaymentSplits } from '../servicePaymentMethod.js';
import { parseTipAmountBody } from '../tipAmount.js';
import type { ServicePaymentSplit } from '../types.js';

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
    if (authReq.user!.role === 'staff') {
      const bid = authReq.user!.barberId;
      if (!bid || existing.barberId !== bid) {
        return res.status(403).json({ error: 'No autorizado' });
      }
    }
    const body = req.body as Record<string, unknown>;
    let payload: Partial<Appointment>;
    if (authReq.user!.role === 'staff') {
      payload = {};
      if ('tipAmount' in body) {
        try {
          payload.tipAmount = parseTipAmountBody(body.tipAmount);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Propina inválida';
          return res.status(400).json({ error: msg });
        }
      }
      if ('servicePaymentSplits' in body) {
        const parsed = parseSplitsBodyField(body.servicePaymentSplits);
        if (body.servicePaymentSplits != null && parsed === null && !Array.isArray(body.servicePaymentSplits)) {
          return res.status(400).json({ error: 'Cobros por método no válidos' });
        }
        payload.servicePaymentSplits = parsed ?? null;
      }
      if ('servicePaymentMethod' in body) {
        const raw = body.servicePaymentMethod;
        payload.servicePaymentMethod =
          raw === null || raw === ''
            ? null
            : parseServicePaymentMethod(raw) ?? undefined;
        if (raw != null && raw !== '' && payload.servicePaymentMethod === undefined) {
          return res.status(400).json({ error: 'Método de pago no válido' });
        }
      }
      const allowedStaff = ['name', 'phone', 'service', 'serviceId', 'date', 'time', 'durationMinutes'];
      for (const key of allowedStaff) {
        if (key in body) (payload as Record<string, unknown>)[key] = body[key];
      }
    } else {
      payload = { ...body } as Partial<Appointment>;
      delete (payload as Record<string, unknown>).servicePaymentSplits;
      delete (payload as Record<string, unknown>).servicePaymentMethod;
      if ('tipAmount' in body) {
        try {
          payload.tipAmount = parseTipAmountBody(body.tipAmount);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Propina inválida';
          return res.status(400).json({ error: msg });
        }
      }
      if ('servicePaymentSplits' in body) {
        const parsed = parseSplitsBodyField(body.servicePaymentSplits);
        if (
          body.servicePaymentSplits != null &&
          parsed === null &&
          !(Array.isArray(body.servicePaymentSplits) && body.servicePaymentSplits.length === 0)
        ) {
          return res.status(400).json({ error: 'Cobros por método no válidos' });
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
            return res.status(400).json({ error: 'Método de pago no válido' });
          }
          payload.servicePaymentMethod = parsed;
        }
      }
    }
    const updated = await repo.updateAppointment(req.params.id, payload);
    if (!updated) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(updated);
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
