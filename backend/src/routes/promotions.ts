import { Router } from 'express';
import * as repo from '../repositories/promotions.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/public', async (_req, res) => {
  try {
    const promotions = await repo.getActivePromotions();
    res.json({ promotions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener promociones' });
  }
});

router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const promotions = await repo.getAllPromotions();
    res.json({ promotions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar promociones' });
  }
});

function parseWeekdaysInput(raw: unknown): number[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((n) => Number(n)).filter((n) => n >= 1 && n <= 7))].sort(
    (a, b) => a - b
  );
}

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const {
    title,
    description,
    badgeText,
    ctaLabel,
    ctaHref,
    active,
    activeWeekdays,
    discountPercent,
    depositCoversFull,
  } = req.body as {
    title?: string;
    description?: string;
    badgeText?: string;
    ctaLabel?: string;
    ctaHref?: string;
    active?: boolean;
    activeWeekdays?: unknown;
    discountPercent?: unknown;
    depositCoversFull?: boolean;
  };
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Se requiere título de la promoción' });
  }
  try {
    const promotion = await repo.createPromotion({
      title: title.trim(),
      description,
      badgeText,
      ctaLabel,
      ctaHref,
      active,
      activeWeekdays: parseWeekdaysInput(activeWeekdays),
      discountPercent:
        discountPercent === null || discountPercent === ''
          ? null
          : Number(discountPercent),
      depositCoversFull,
    });
    res.status(201).json(promotion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear promoción' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const {
    title,
    description,
    badgeText,
    ctaLabel,
    ctaHref,
    active,
    sortOrder,
    activeWeekdays,
    discountPercent,
    depositCoversFull,
  } = req.body as {
    title?: string;
    description?: string;
    badgeText?: string;
    ctaLabel?: string;
    ctaHref?: string;
    active?: boolean;
    sortOrder?: unknown;
    activeWeekdays?: unknown;
    discountPercent?: unknown;
    depositCoversFull?: boolean;
  };
  const updates: Parameters<typeof repo.updatePromotion>[1] = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Título inválido' });
    }
    updates.title = title.trim();
  }
  if (description !== undefined) updates.description = String(description);
  if (badgeText !== undefined) updates.badgeText = String(badgeText);
  if (ctaLabel !== undefined) updates.ctaLabel = String(ctaLabel);
  if (ctaHref !== undefined) updates.ctaHref = String(ctaHref);
  if (active !== undefined) updates.active = Boolean(active);
  if (sortOrder !== undefined) {
    const order = Number(sortOrder);
    if (!Number.isFinite(order)) {
      return res.status(400).json({ error: 'Orden inválido' });
    }
    updates.sortOrder = Math.floor(order);
  }
  if (activeWeekdays !== undefined) {
    updates.activeWeekdays = parseWeekdaysInput(activeWeekdays) ?? [];
  }
  if (discountPercent !== undefined) {
    updates.discountPercent =
      discountPercent === null || discountPercent === '' ? null : Number(discountPercent);
  }
  if (depositCoversFull !== undefined) updates.depositCoversFull = Boolean(depositCoversFull);
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }
  try {
    const promotion = await repo.updatePromotion(req.params.id, updates);
    if (!promotion) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.json(promotion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar promoción' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const ok = await repo.deletePromotion(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar promoción' });
  }
});

export default router;
