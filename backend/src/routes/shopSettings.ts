import { Router } from 'express';
import * as repo from '../repositories/shopSettings.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const s = await repo.getShopSettings();
    res.json({
      cutoffHours: s.cutoffHours,
      openWeekdays: s.openWeekdays,
      depositPercent: s.depositPercent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar configuración' });
  }
});

router.patch('/', requireAuth, requireAdmin, async (req, res) => {
  const { cutoffHours, openWeekdays, depositPercent } = req.body as {
    cutoffHours?: number;
    openWeekdays?: number[];
    depositPercent?: number;
  };
  try {
    const updated = await repo.updateShopSettings({
      ...(cutoffHours != null ? { cutoffHours: Number(cutoffHours) } : {}),
      ...(openWeekdays != null ? { openWeekdays } : {}),
      ...(depositPercent != null ? { depositPercent: Number(depositPercent) } : {}),
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

export default router;
