import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { dbDateTimeToIsoUtc } from '../dbDateTime.js';
import * as userRepo from '../repositories/users.js';
import * as appointmentRepo from '../repositories/appointments.js';

const router = Router();

router.post('/clients', requireAuth, requireAdmin, async (req, res) => {
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
      client: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: userPhones[0] ?? null,
        phones: userPhones,
        points: user.points,
        avatarUrl: user.avatar_url ?? null,
        createdAt: dbDateTimeToIsoUtc(user.created_at),
        appointments: [],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al crear cliente';
    const status = /ya existe/i.test(msg) ? 409 : 400;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: msg });
  }
});

router.get('/clients', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const clients = await userRepo.findAllClients();
    const ids = clients.map((c) => c.id);
    const phonesByUser = await userRepo.getClientPhonesByUserIds(ids);
    const byUser = await appointmentRepo.getAppointmentsByUserIds(ids);
    const body = clients.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      phone: (phonesByUser.get(c.id) ?? [])[0] ?? null,
      phones: phonesByUser.get(c.id) ?? [],
      points: c.points,
      avatarUrl: c.avatar_url ?? null,
      createdAt: dbDateTimeToIsoUtc(c.created_at),
      appointments: byUser.get(c.id) ?? [],
    }));
    res.json({ clients: body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar clientes' });
  }
});

router.get('/clients/:id', requireAuth, requireAdmin, async (req, res) => {
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
      client: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: phones[0] ?? null,
        phones,
        points: user.points,
        avatarUrl: user.avatar_url ?? null,
        createdAt: dbDateTimeToIsoUtc(user.created_at),
        appointments,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar el cliente' });
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
