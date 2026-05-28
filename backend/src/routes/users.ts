import { Router } from 'express';
import { requireAuth, requireAdmin, requireStaffOrAdmin } from '../middleware/auth.js';
import * as userRepo from '../repositories/users.js';
import * as appointmentRepo from '../repositories/appointments.js';
import { toAdminClientPayload } from './adminClientPayload.js';
import { assignSubscriptionPlanToClient } from '../services/clientSubscription.js';

const router = Router();

router.post('/clients', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { name, email, points, phone, phones } = req.body as {
    name?: string;
    email?: string;
    points?: unknown;
    phone?: string;
    phones?: unknown;
  };
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Se requiere name' });
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 1) {
    return res.status(400).json({ error: 'El nombre no puede estar vacío' });
  }
  const emailTrim = typeof email === 'string' ? email.trim() : '';
  if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  let pts = 0;
  if (points != null && points !== '') {
    const n = typeof points === 'number' ? points : parseInt(String(points), 10);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: 'Los puntos deben ser un número ≥ 0' });
    }
    pts = Math.min(999_999, Math.floor(n));
  }
  try {
    const phoneTrim = typeof phone === 'string' ? phone.trim() : '';
    const parsedPhones = Array.isArray(phones)
      ? phones
          .filter((p): p is string => typeof p === 'string')
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    const mergedPhones = [...parsedPhones, ...(phoneTrim ? [phoneTrim] : [])];
    const user = await userRepo.createManualClient({
      name: trimmedName,
      email: emailTrim || undefined,
      points: pts,
      phone: phoneTrim || undefined,
      phones: mergedPhones,
    });
    const userPhones = user.phones ?? (await userRepo.getClientPhonesByUserId(user.id));
    res.status(201).json({
      client: await toAdminClientPayload(user, userPhones, []),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al crear cliente';
    const status = /ya existe/i.test(msg) ? 409 : 400;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: msg });
  }
});

router.get('/clients', requireAuth, requireStaffOrAdmin, async (_req, res) => {
  try {
    const clients = await userRepo.findAllClients();
    const ids = clients.map((c) => c.id);
    const phonesByUser = await userRepo.getClientPhonesByUserIds(ids);
    const byUser = await appointmentRepo.getAppointmentsByUserIds(ids);
    const body = await Promise.all(
      clients.map((c) =>
        toAdminClientPayload(c, phonesByUser.get(c.id) ?? [], byUser.get(c.id) ?? [])
      )
    );
    res.json({ clients: body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar clientes' });
  }
});

router.get('/clients/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const user = await userRepo.findUserById(id);
    if (!user || user.role !== 'client') {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const map = await appointmentRepo.getAppointmentsByUserIds([id]);
    const phones = await userRepo.getClientPhonesByUserId(id);
    const appointments = map.get(id) ?? [];
    res.json({
      client: await toAdminClientPayload(user, phones, appointments),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar el cliente' });
  }
});

router.patch('/clients/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const body = req.body as {
    name?: unknown;
    email?: unknown;
    phones?: unknown;
    phone?: unknown;
    points?: unknown;
    depositExempt?: unknown;
    subscriptionPlanId?: unknown;
    adminNotes?: unknown;
  };

  const patch: userRepo.UpdateAdminClientInput = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return res.status(400).json({ error: 'name debe ser texto' });
    }
    patch.name = body.name;
  }
  if (body.email !== undefined) {
    if (typeof body.email !== 'string') {
      return res.status(400).json({ error: 'email debe ser texto' });
    }
    patch.email = body.email;
  }
  if (body.phones !== undefined) {
    if (!Array.isArray(body.phones)) {
      return res.status(400).json({ error: 'phones debe ser un array' });
    }
    patch.phones = body.phones
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean);
  } else if (body.phone !== undefined) {
    if (typeof body.phone !== 'string') {
      return res.status(400).json({ error: 'phone debe ser texto' });
    }
    const t = body.phone.trim();
    patch.phones = t ? [t] : [];
  }
  if (body.points !== undefined) {
    const n = typeof body.points === 'number' ? body.points : parseInt(String(body.points), 10);
    if (!Number.isFinite(n)) {
      return res.status(400).json({ error: 'points debe ser un número' });
    }
    patch.points = n;
  }
  if (body.depositExempt !== undefined) {
    if (typeof body.depositExempt !== 'boolean') {
      return res.status(400).json({ error: 'depositExempt debe ser true o false' });
    }
    patch.depositExempt = body.depositExempt;
  }
  let subscriptionPlanIdPatch: string | null | undefined;
  if (body.subscriptionPlanId !== undefined) {
    if (body.subscriptionPlanId === null || body.subscriptionPlanId === '') {
      subscriptionPlanIdPatch = null;
    } else if (typeof body.subscriptionPlanId === 'string') {
      subscriptionPlanIdPatch = body.subscriptionPlanId.trim();
      if (!subscriptionPlanIdPatch) subscriptionPlanIdPatch = null;
    } else {
      return res.status(400).json({ error: 'subscriptionPlanId debe ser texto o null' });
    }
  }
  if (body.adminNotes !== undefined) {
    if (body.adminNotes !== null && typeof body.adminNotes !== 'string') {
      return res.status(400).json({ error: 'adminNotes debe ser texto o null' });
    }
    patch.adminNotes = body.adminNotes === null ? null : body.adminNotes;
  }

  if (Object.keys(patch).length === 0 && subscriptionPlanIdPatch === undefined) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  try {
    const existing = await userRepo.findUserById(id);
    if (!existing || existing.role !== 'client') {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    if (patch.email !== undefined && existing.google_uid) {
      return res.status(400).json({
        error: 'No se puede cambiar el email de un cliente vinculado a Google',
      });
    }
    if (subscriptionPlanIdPatch !== undefined) {
      await assignSubscriptionPlanToClient(id, subscriptionPlanIdPatch);
    }

    const updated =
      Object.keys(patch).length > 0
        ? await userRepo.updateAdminClientById(id, patch)
        : await userRepo.findUserById(id);
    if (!updated) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const phones = await userRepo.getClientPhonesByUserId(id);
    const map = await appointmentRepo.getAppointmentsByUserIds([id]);
    res.json({
      client: await toAdminClientPayload(updated, phones, map.get(id) ?? []),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar el cliente';
    const status = /ya existe|inválido|no puede/i.test(msg) ? 400 : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: msg });
  }
});

router.delete('/clients/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const ok = await userRepo.deleteClientById(id);
    if (!ok) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    return res.status(204).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});

export default router;
