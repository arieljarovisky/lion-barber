import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as userRepo from '../repositories/users.js';
import * as appointmentRepo from '../repositories/appointments.js';

const router = Router();

router.post('/clients', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, points } = req.body as { name?: string; email?: string; points?: unknown };
  if (!name || typeof name !== 'string' || !email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Se requiere name y email' });
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 1) {
    return res.status(400).json({ error: 'El nombre no puede estar vacío' });
  }
  const emailTrim = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
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
    const user = await userRepo.createManualClient({ name: trimmedName, email: emailTrim, points: pts });
    res.status(201).json({
      client: {
        id: user.id,
        email: user.email,
        name: user.name,
        points: user.points,
        createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
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
    const byUser = await appointmentRepo.getAppointmentsByUserIds(ids);
    const body = clients.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      points: c.points,
      createdAt: c.created_at instanceof Date ? c.created_at.toISOString() : String(c.created_at),
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
    const appointments = map.get(id) ?? [];
    res.json({
      client: {
        id: user.id,
        email: user.email,
        name: user.name,
        points: user.points,
        createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
        appointments,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar el cliente' });
  }
});

export default router;
