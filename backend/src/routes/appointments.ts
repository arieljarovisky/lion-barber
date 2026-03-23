import { Router } from 'express';
import * as repo from '../repositories/appointments.js';
import { requireAuth } from '../middleware/auth.js';

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

router.get('/', async (req, res) => {
  const { date, barberId } = req.query;
  try {
    if (date && typeof date === 'string') {
      if (barberId && typeof barberId === 'string') {
        return res.json(await repo.getAppointmentsByBarber(barberId, date));
      }
      return res.json(await repo.getAppointmentsByDate(date));
    }
    if (barberId && typeof barberId === 'string') {
      return res.json(await repo.getAppointmentsByBarber(barberId));
    }
    res.json(await repo.getAllAppointments());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  const authReq = req as import('../middleware/auth.js').AuthRequest;
  try {
    const list = await repo.getAppointmentsByUserId(authReq.user!.id);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mis citas' });
  }
});

router.get('/:id', async (req, res) => {
  const app = await repo.getAppointmentById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(app);
});

router.post('/', async (req, res) => {
  const { name, phone, service, serviceId, barber, barberId, date, time, userId, depositPaid, durationMinutes } =
    req.body;
  if (!name || !phone || !service || !date || !time) {
    return res.status(400).json({ error: 'Faltan campos: name, phone, service, date, time' });
  }
  if (!barberId) {
    return res.status(400).json({ error: 'Falta barberId (o elige "Cualquier barbero")' });
  }
  try {
    const created = await repo.createAppointment({
      name,
      phone,
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
    res.status(201).json(created);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al crear cita';
    const code = /ocupado|solapa|No hay barbero/i.test(msg) ? 409 : 500;
    if (code === 500) console.error(err);
    res.status(code).json({ error: msg });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const updated = await repo.updateAppointment(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar';
    const code = /ocupado|solapa/i.test(msg) ? 409 : 500;
    if (code === 500) console.error(err);
    res.status(code).json({ error: msg });
  }
});

router.delete('/:id', async (req, res) => {
  const ok = await repo.deleteAppointment(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Cita no encontrada' });
  res.status(204).send();
});

export default router;
