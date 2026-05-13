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
      closeTime: s.closeTime,
      weekdayHours: s.weekdayHours,
      closedDates: s.closedDates,
      whatsappMessageTemplate: s.whatsappMessageTemplate,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar configuración' });
  }
});

router.patch('/', requireAuth, requireAdmin, async (req, res) => {
  const {
    cutoffHours,
    openWeekdays,
    depositPercent,
    closeTime,
    weekdayHours,
    closedDates,
    whatsappMessageTemplate,
  } = req.body as {
    cutoffHours?: number;
    openWeekdays?: number[];
    depositPercent?: number;
    closeTime?: string;
    weekdayHours?: Record<number, { openTime?: string; closeTime?: string }>;
    closedDates?: string[];
    whatsappMessageTemplate?: string | null;
  };
  try {
    const updated = await repo.updateShopSettings({
      ...(cutoffHours != null ? { cutoffHours: Number(cutoffHours) } : {}),
      ...(openWeekdays != null ? { openWeekdays } : {}),
      ...(depositPercent != null ? { depositPercent: Number(depositPercent) } : {}),
      ...(closeTime != null ? { closeTime: String(closeTime) } : {}),
      ...(weekdayHours != null ? { weekdayHours } : {}),
      ...(closedDates != null ? { closedDates } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body ?? {}, 'whatsappMessageTemplate')
        ? { whatsappMessageTemplate: whatsappMessageTemplate ?? null }
        : {}),
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

export default router;
