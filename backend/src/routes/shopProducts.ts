import { Router } from 'express';
import * as repo from '../repositories/shopProducts.js';
import { saveProductImageFromDataUrl } from '../services/productImageUpload.js';
import { requireAuth, requireStaffOrAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/public', async (_req, res) => {
  try {
    const products = await repo.getWebShopProducts();
    res.json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar productos' });
  }
});

router.get('/', requireAuth, requireStaffOrAdmin, async (_req, res) => {
  try {
    const products = await repo.getAllShopProducts();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar productos' });
  }
});

router.post('/', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { name, pointsReward, unitPrice, description, imageUrl, webActive } = req.body as {
    name?: string;
    pointsReward?: unknown;
    unitPrice?: unknown;
    description?: unknown;
    imageUrl?: unknown;
    webActive?: boolean;
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
    const p = await repo.createShopProduct({
      name: name.trim(),
      pointsReward: pr,
      unitPrice: up,
      description: description != null ? String(description) : undefined,
      imageUrl: imageUrl != null ? String(imageUrl) : undefined,
      webActive,
    });
    res.status(201).json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

router.patch('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { name, pointsReward, unitPrice, description, imageUrl, webActive } = req.body as {
    name?: string;
    pointsReward?: unknown;
    unitPrice?: unknown;
    description?: unknown;
    imageUrl?: unknown;
    webActive?: boolean;
  };
  const updates: Parameters<typeof repo.updateShopProduct>[1] = {};
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
  if (description !== undefined) {
    updates.description = description != null ? String(description) : null;
  }
  if (imageUrl !== undefined) {
    updates.imageUrl = imageUrl != null && String(imageUrl).trim() !== '' ? String(imageUrl).trim() : null;
  }
  if (webActive !== undefined) updates.webActive = Boolean(webActive);
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

router.post('/:id/image', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { imageData } = req.body as { imageData?: string };
  if (!imageData || typeof imageData !== 'string') {
    return res.status(400).json({ error: 'Se requiere la imagen' });
  }
  try {
    const existing = await repo.getShopProductById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
    const imageUrl = await saveProductImageFromDataUrl(req.params.id, imageData);
    const updated = await repo.updateShopProduct(req.params.id, { imageUrl });
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo guardar la imagen';
    res.status(400).json({ error: msg });
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
