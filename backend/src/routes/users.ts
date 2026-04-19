import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as userRepo from '../repositories/users.js';
import * as appointmentRepo from '../repositories/appointments.js';

const router = Router();

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

export default router;
