import { Router } from 'express';
import * as repo from '../repositories/appointments.js';

const router = Router();

router.get('/availability', async (req, res) => {
  const { date, barberId } = req.query;
  if (typeof date !== 'string' || typeof barberId !== 'string') {
    return res.status(400).json({ error: 'Se requieren date y barberId' });
  }
  const slots = await repo.getAvailableSlots(date, barberId);
  res.json({ slots });
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

router.get('/:id', async (req, res) => {
  const app = await repo.getAppointmentById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(app);
});

router.post('/', async (req, res) => {
  const { name, phone, service, barber, barberId, date, time } = req.body;
  if (!name || !phone || !service || !date || !time) {
    return res.status(400).json({ error: 'Faltan campos: name, phone, service, date, time' });
  }
  try {
    const created = await repo.createAppointment({ name, phone, service, barber, barberId, date, time });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear cita' });
  }
});

router.patch('/:id', async (req, res) => {
  const updated = await repo.updateAppointment(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const ok = await repo.deleteAppointment(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Cita no encontrada' });
  res.status(204).send();
});

export default router;
