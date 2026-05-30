import { Router } from 'express';
import * as repo from '../repositories/subscriptionPlans.js';
import { requireAuth, requireAdmin, requireStaffOrAdmin } from '../middleware/auth.js';

const router = Router();

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
  const { name, monthlyPrice, cutsPerMonth, active } = req.body as {
    name?: string;
    monthlyPrice?: string;
    cutsPerMonth?: unknown;
    active?: boolean;
  };
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Se requiere nombre del plan' });
  }
  const price = monthlyPrice != null ? String(monthlyPrice).trim() : '';
  if (!price) {
    return res.status(400).json({ error: 'Se requiere precio mensual' });
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
      active: active !== false,
    });
    res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear plan' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, monthlyPrice, cutsPerMonth, active } = req.body as {
    name?: string;
    monthlyPrice?: string;
    cutsPerMonth?: unknown;
    active?: boolean;
  };
  const updates: {
    name?: string;
    monthlyPrice?: string;
    cutsPerMonth?: number;
    active?: boolean;
  } = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nombre inválido' });
    }
    updates.name = name.trim();
  }
  if (monthlyPrice !== undefined) {
    const price = String(monthlyPrice).trim();
    if (!price) return res.status(400).json({ error: 'Precio mensual inválido' });
    updates.monthlyPrice = price;
  }
  if (cutsPerMonth !== undefined) {
    const cuts = Number(cutsPerMonth);
    if (!Number.isFinite(cuts) || cuts < 1) {
      return res.status(400).json({ error: 'Los cortes por mes deben ser al menos 1' });
    }
    updates.cutsPerMonth = cuts;
  }
  if (active !== undefined) updates.active = Boolean(active);
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
