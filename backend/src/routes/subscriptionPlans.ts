import { Router } from 'express';
import * as repo from '../repositories/subscriptionPlans.js';
import { requireAuth, requireAdmin, requireStaffOrAdmin } from '../middleware/auth.js';

const router = Router();

function parseValidityDays(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(999, Math.floor(n));
}

router.get('/public', async (_req, res) => {
  try {
    const plans = await repo.getActiveSubscriptionPlans();
    res.json({ plans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener planes de abono' });
  }
});

router.get('/', requireAuth, requireStaffOrAdmin, async (_req, res) => {
  try {
    const plans = await repo.getAllSubscriptionPlans();
    res.json({ plans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar planes de abono' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = body.name;
  const monthlyPrice = body.monthlyPrice;
  const cutsPerMonth = body.cutsPerMonth;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Se requiere nombre del plan' });
  }
  const price = monthlyPrice != null ? String(monthlyPrice).trim() : '';
  if (!price) {
    return res.status(400).json({ error: 'Se requiere el precio del plan' });
  }
  const cuts = Number(cutsPerMonth);
  if (!Number.isFinite(cuts) || cuts < 1) {
    return res.status(400).json({ error: 'Los cortes por mes deben ser al menos 1' });
  }
  try {
    const plan = await repo.createSubscriptionPlan({
      name: name.trim(),
      monthlyPrice: price,
      cutsPerMonth: cuts,
      active: body.active !== false,
      description: typeof body.description === 'string' ? body.description : undefined,
      category: typeof body.category === 'string' ? body.category : undefined,
      compareAtPrice: typeof body.compareAtPrice === 'string' ? body.compareAtPrice : undefined,
      discountLabel: typeof body.discountLabel === 'string' ? body.discountLabel : undefined,
      bonusText: typeof body.bonusText === 'string' ? body.bonusText : undefined,
      features: Array.isArray(body.features)
        ? body.features.filter((x): x is string => typeof x === 'string')
        : undefined,
      highlighted: Boolean(body.highlighted),
      badgeText: typeof body.badgeText === 'string' ? body.badgeText : undefined,
      validityDays: parseValidityDays(body.validityDays),
    });
    res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear plan' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const updates: Parameters<typeof repo.updateSubscriptionPlan>[1] = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return res.status(400).json({ error: 'Nombre inválido' });
    }
    updates.name = body.name.trim();
  }
  if (body.monthlyPrice !== undefined) {
    const price = String(body.monthlyPrice).trim();
    if (!price) return res.status(400).json({ error: 'Precio del plan inválido' });
    updates.monthlyPrice = price;
  }
  if (body.cutsPerMonth !== undefined) {
    const cuts = Number(body.cutsPerMonth);
    if (!Number.isFinite(cuts) || cuts < 1) {
      return res.status(400).json({ error: 'Los cortes por mes deben ser al menos 1' });
    }
    updates.cutsPerMonth = cuts;
  }
  if (body.active !== undefined) updates.active = Boolean(body.active);
  if (body.description !== undefined) updates.description = String(body.description);
  if (body.category !== undefined) updates.category = String(body.category);
  if (body.compareAtPrice !== undefined) updates.compareAtPrice = String(body.compareAtPrice);
  if (body.discountLabel !== undefined) updates.discountLabel = String(body.discountLabel);
  if (body.bonusText !== undefined) updates.bonusText = String(body.bonusText);
  if (body.badgeText !== undefined) updates.badgeText = String(body.badgeText);
  if (body.highlighted !== undefined) updates.highlighted = Boolean(body.highlighted);
  if (body.validityDays !== undefined) updates.validityDays = parseValidityDays(body.validityDays);
  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (!Number.isFinite(order)) {
      return res.status(400).json({ error: 'Orden inválido' });
    }
    updates.sortOrder = Math.floor(order);
  }
  if (body.features !== undefined) {
    if (!Array.isArray(body.features)) {
      return res.status(400).json({ error: 'Las características deben ser un arreglo' });
    }
    updates.features = body.features.filter((x): x is string => typeof x === 'string');
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }
  try {
    const plan = await repo.updateSubscriptionPlan(req.params.id, updates);
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar plan' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const ok = await repo.deleteSubscriptionPlan(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Plan no encontrado' });
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar';
    const status = /clientes/i.test(msg) ? 409 : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: msg });
  }
});

export default router;
