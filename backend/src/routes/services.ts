import { Router } from 'express';
import * as repo from '../repositories/services.js';
import type { Service } from '../types.js';
import {
  requireAuth,
  requireAdmin,
  requireStaffOrAdmin,
  optionalAuth,
  type AuthRequest,
} from '../middleware/auth.js';

const router = Router();

router.get('/', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const role = req.user?.role;
    const canSeeInternal = role === 'admin' || role === 'staff';
    const services = await repo.getAllServices({ includeInternal: canSeeInternal });
    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, price, duration, desc, emoji, pointsReward, internal } = req.body as {
      name?: string;
      price?: unknown;
      duration?: unknown;
      desc?: unknown;
      emoji?: unknown;
      pointsReward?: unknown;
      internal?: unknown;
    };
    if (!name || price == null || duration == null) {
      res.status(400).json({ error: 'Faltan nombre, precio o duración' });
      return;
    }
    const pr =
      pointsReward != null && pointsReward !== ''
        ? Number(pointsReward)
        : 0;
    const service = await repo.createService({
      name: String(name),
      price: String(price),
      duration: Number(duration),
      desc: desc != null ? String(desc) : '',
      emoji: emoji != null ? String(emoji) : '',
      pointsReward: Number.isFinite(pr) ? pr : 0,
      internal: internal === true || internal === 1 || internal === '1' || internal === 'true',
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

router.put('/:id/points-reward', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const id = req.params.id;
  const raw = (req.body as { pointsReward?: unknown }).pointsReward;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? 0), 10);
  if (!Number.isFinite(n) || n < 0) {
    return res.status(400).json({ error: 'pointsReward debe ser un número ≥ 0' });
  }
  try {
    const service = await repo.updateServicePointsReward(id, n);
    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado' });
      return;
    }
    res.json(service);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar puntos del servicio' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, price, duration, desc, emoji, pointsReward, internal } = req.body as {
      name?: string;
      price?: string;
      duration?: number;
      desc?: string;
      emoji?: string;
      pointsReward?: number;
      internal?: unknown;
    };
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = String(name);
    if (price !== undefined) updates.price = String(price);
    if (duration !== undefined) updates.duration = Number(duration);
    if (desc !== undefined) updates.desc = String(desc);
    if (emoji !== undefined) updates.emoji = String(emoji);
    if (pointsReward !== undefined) updates.pointsReward = Number(pointsReward);
    if (internal !== undefined) {
      updates.internal =
        internal === true || internal === 1 || internal === '1' || internal === 'true';
    }
    const service = await repo.updateService(req.params.id, updates as Partial<Service>);
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
