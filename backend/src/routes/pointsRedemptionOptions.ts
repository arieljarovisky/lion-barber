import { Router } from 'express';
import * as repo from '../repositories/pointsRedemptionOptions.js';
import { requireAuth, requireStaffOrAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const options = await repo.listPointsRedemptionOptions();
    res.json({ options });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar opciones de canje' });
  }
});

router.post('/', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { label, pointsCost } = req.body as { label?: unknown; pointsCost?: unknown };
  if (!label || typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'Se requiere una descripción del canje' });
  }
  const pc =
    pointsCost != null && pointsCost !== '' ? Number(pointsCost) : NaN;
  if (!Number.isFinite(pc) || pc < 1) {
    return res.status(400).json({ error: 'Los puntos necesarios deben ser un número ≥ 1' });
  }
  try {
    const opt = await repo.createPointsRedemptionOption({ label: label.trim(), pointsCost: pc });
    res.status(201).json(opt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la opción de canje' });
  }
});

router.patch('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { label, pointsCost } = req.body as { label?: unknown; pointsCost?: unknown };
  const updates: { label?: string; pointsCost?: number } = {};
  if (label !== undefined) {
    if (typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ error: 'La descripción no puede estar vacía' });
    }
    updates.label = label.trim();
  }
  if (pointsCost !== undefined) {
    const pc = Number(pointsCost);
    if (!Number.isFinite(pc) || pc < 1) {
      return res.status(400).json({ error: 'Los puntos necesarios deben ser un número ≥ 1' });
    }
    updates.pointsCost = pc;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }
  try {
    const opt = await repo.updatePointsRedemptionOption(id, updates);
    if (!opt) return res.status(404).json({ error: 'Opción no encontrada' });
    res.json(opt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

router.delete('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const ok = await repo.deletePointsRedemptionOption(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Opción no encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
