import { Router } from 'express';
import * as repo from '../repositories/services.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const services = await repo.getAllServices();
    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const service = await repo.getServiceById(req.params.id);
    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado' });
      return;
    }
    res.json(service);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener servicio' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, price, duration, desc, emoji } = req.body;
    if (!name || price == null || duration == null) {
      res.status(400).json({ error: 'Faltan nombre, precio o duración' });
      return;
    }
    const service = await repo.createService({
      name: String(name),
      price: String(price),
      duration: Number(duration),
      desc: desc != null ? String(desc) : '',
      emoji: emoji != null ? String(emoji) : '',
    });
    res.status(201).json(service);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear servicio' });
  }
});

router.patch('/reorder/manual', requireAuth, requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x: unknown) => String(x)) : null;
  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: 'Enviá ids en el orden deseado.' });
  }
  try {
    const ordered = await repo.reorderServices(ids);
    res.json(ordered);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo actualizar el orden de servicios';
    res.status(400).json({ error: msg });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, price, duration, desc, emoji } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = String(name);
    if (price !== undefined) updates.price = String(price);
    if (duration !== undefined) updates.duration = Number(duration);
    if (desc !== undefined) updates.desc = String(desc);
    if (emoji !== undefined) updates.emoji = String(emoji);
    const service = await repo.updateService(req.params.id, updates);
    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado' });
      return;
    }
    res.json(service);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar servicio' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const ok = await repo.deleteService(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Servicio no encontrado' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar servicio' });
  }
});

export default router;
