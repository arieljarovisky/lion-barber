import { Router } from 'express';
import * as repo from '../repositories/barbers.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const barbers = await repo.getAllBarbers();
    res.json(barbers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener barberos' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { commissionPercent } = req.body as { commissionPercent?: number };
  if (commissionPercent == null || Number.isNaN(Number(commissionPercent))) {
    return res.status(400).json({ error: 'Se requiere commissionPercent' });
  }
  try {
    const updated = await repo.updateBarberCommission(req.params.id, Number(commissionPercent));
    if (!updated) return res.status(404).json({ error: 'Barbero no encontrado' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

export default router;
