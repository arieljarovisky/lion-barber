import { Router } from 'express';
import * as repo from '../repositories/shopProducts.js';
import { requireAuth, requireStaffOrAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const products = await repo.getAllShopProducts();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar productos' });
  }
});

router.post('/', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { name, pointsReward, unitPrice } = req.body as {
    name?: string;
    pointsReward?: unknown;
    unitPrice?: unknown;
  };
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Se requiere nombre del producto' });
  }
  const pr = pointsReward != null && pointsReward !== '' ? Number(pointsReward) : 0;
  if (!Number.isFinite(pr) || pr < 0) {
    return res.status(400).json({ error: 'Los puntos deben ser un número ≥ 0' });
  }
  const up =
    unitPrice != null && String(unitPrice).trim() !== '' ? String(unitPrice).trim() : undefined;
  try {
    const p = await repo.createShopProduct({ name: name.trim(), pointsReward: pr, unitPrice: up });
    res.status(201).json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

router.patch('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { name, pointsReward, unitPrice } = req.body as {
    name?: string;
    pointsReward?: unknown;
    unitPrice?: unknown;
  };
  const updates: { name?: string; pointsReward?: number; unitPrice?: string | null } = {};
  if (name !== undefined) updates.name = String(name);
  if (pointsReward !== undefined) {
    const pr = Number(pointsReward);
    if (!Number.isFinite(pr) || pr < 0) {
      return res.status(400).json({ error: 'Los puntos deben ser un número ≥ 0' });
    }
    updates.pointsReward = pr;
  }
  if (unitPrice !== undefined) {
    updates.unitPrice = unitPrice != null && String(unitPrice).trim() !== '' ? String(unitPrice).trim() : null;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }
  try {
    const p = await repo.updateShopProduct(req.params.id, updates);
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

router.delete('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const ok = await repo.deleteShopProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Producto no encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

export default router;
