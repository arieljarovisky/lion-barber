import { Router } from 'express';
import * as repo from '../repositories/productPurchases.js';
import { requireAuth, requireStaffOrAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : '';
  const to = typeof req.query.to === 'string' ? req.query.to : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'Formato de fecha inválido (YYYY-MM-DD)' });
  }
  try {
    const items = await repo.listProductPurchasesInRange(from, to);
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar compras de productos' });
  }
});

router.get('/total', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : '';
  const to = typeof req.query.to === 'string' ? req.query.to : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'Formato de fecha inválido (YYYY-MM-DD)' });
  }
  try {
    const total = await repo.sumProductPurchasesInRange(from, to);
    res.json({ total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular total de compras' });
  }
});

router.post('/', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { productId, quantity, unitCost, purchaseDate, notes } = req.body as {
    productId?: string;
    quantity?: unknown;
    unitCost?: unknown;
    purchaseDate?: string;
    notes?: string;
  };
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ error: 'Se requiere un producto' });
  }
  if (!purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    return res.status(400).json({ error: 'Se requiere una fecha válida (YYYY-MM-DD)' });
  }
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    return res.status(400).json({ error: 'La cantidad debe ser al menos 1' });
  }
  const cost = Number(unitCost);
  if (!Number.isFinite(cost) || cost <= 0) {
    return res.status(400).json({ error: 'El costo unitario debe ser mayor a 0' });
  }
  try {
    const userId = (req as { user?: { id?: number } }).user?.id ?? null;
    const item = await repo.createProductPurchase({
      productId,
      quantity: qty,
      unitCost: cost,
      purchaseDate,
      notes,
      createdByUserId: userId,
    });
    res.status(201).json({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al crear compra';
    res.status(400).json({ error: msg });
  }
});

router.patch('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const { productId, quantity, unitCost, purchaseDate, notes } = req.body as {
    productId?: string;
    quantity?: unknown;
    unitCost?: unknown;
    purchaseDate?: string;
    notes?: string | null;
  };
  const updates: Parameters<typeof repo.updateProductPurchase>[1] = {};
  if (productId !== undefined) updates.productId = productId;
  if (quantity !== undefined) {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ error: 'La cantidad debe ser al menos 1' });
    }
    updates.quantity = qty;
  }
  if (unitCost !== undefined) {
    const cost = Number(unitCost);
    if (!Number.isFinite(cost) || cost <= 0) {
      return res.status(400).json({ error: 'El costo unitario debe ser mayor a 0' });
    }
    updates.unitCost = cost;
  }
  if (purchaseDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
      return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
    }
    updates.purchaseDate = purchaseDate;
  }
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }
  try {
    const item = await repo.updateProductPurchase(id, updates);
    if (!item) return res.status(404).json({ error: 'Compra no encontrada' });
    res.json({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar compra';
    res.status(400).json({ error: msg });
  }
});

router.delete('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const ok = await repo.deleteProductPurchase(id);
    if (!ok) return res.status(404).json({ error: 'Compra no encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar compra' });
  }
});

export default router;
