import { Router } from 'express';
import * as repo from '../repositories/shopProducts.js';
import { getProductImagePayload } from '../repositories/shopProducts.js';
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

/** Imagen del producto (persistida en DB). Público para la tienda web. */
router.get('/:id/image', async (req, res) => {
  try {
    const payload = await getProductImagePayload(req.params.id);
    if (!payload) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).send('Imagen no encontrada');
    }
    res.setHeader('Content-Type', payload.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('ETag', `"${payload.buffer.length}-${payload.buffer[0] ?? 0}"`);
    res.send(payload.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener imagen');
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
  const { name, pointsReward, unitPrice, description, webActive, stock } = req.body as {
    name?: string;
    pointsReward?: unknown;
    unitPrice?: unknown;
    description?: unknown;
    webActive?: boolean;
    stock?: unknown;
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
  let stockValue: number | null | undefined;
  if (stock !== undefined) {
    const parsed = repo.normalizeProductStock(stock);
    if (parsed === 'invalid') {
      return res.status(400).json({ error: 'El stock debe ser un número entero ≥ 0' });
    }
    stockValue = parsed;
  }
  try {
    const p = await repo.createShopProduct({
      name: name.trim(),
      pointsReward: pr,
      unitPrice: up,
      description: description != null ? String(description) : undefined,
      webActive,
      stock: stockValue,
    });
    res.status(201).json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

router.patch('/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { name, pointsReward, unitPrice, description, imageUrl, webActive, stock } = req.body as {
    name?: string;
    pointsReward?: unknown;
    unitPrice?: unknown;
    description?: unknown;
    imageUrl?: unknown;
    webActive?: boolean;
    stock?: unknown;
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
  if (imageUrl === null) {
    updates.imageUrl = null;
  }
  if (webActive !== undefined) updates.webActive = Boolean(webActive);
  if (stock !== undefined) {
    const parsed = repo.normalizeProductStock(stock);
    if (parsed === 'invalid') {
      return res.status(400).json({ error: 'El stock debe ser un número entero ≥ 0' });
    }
    updates.stock = parsed;
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

router.post('/:id/image', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { imageData } = req.body as { imageData?: string };
  if (!imageData || typeof imageData !== 'string') {
    return res.status(400).json({ error: 'Se requiere la imagen' });
  }
  try {
    const existing = await repo.getShopProductById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
    await saveProductImageFromDataUrl(req.params.id, imageData);
    const updated = await repo.getShopProductById(req.params.id);
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
