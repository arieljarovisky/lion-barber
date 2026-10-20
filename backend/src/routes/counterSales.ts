import { Router } from 'express';
import { parseArsAmount } from '../arsAmount.js';
import { MAX_APPOINTMENT_PRODUCT_LINES } from '../appointmentProducts.js';
import { requireAuth, requireStaffOrAdmin, type AuthRequest } from '../middleware/auth.js';
import { isDailyCashCloseDate } from '../repositories/dailyCashClose.js';
import { getBarberById } from '../repositories/barbers.js';
import * as repo from '../repositories/counterSales.js';
import { findUserById } from '../repositories/users.js';
import {
  getShopProductById,
  syncAppointmentProductStock,
} from '../repositories/shopProducts.js';
import { notifyClientSubscriptionActivated } from '../services/email.js';
import {
  purchaseSubscriptionPlanForClient,
  revokePurchasedSubscription,
} from '../services/clientSubscription.js';
import type { AppointmentProductLine } from '../types.js';

const router = Router();

router.use(requireAuth, requireStaffOrAdmin);

const PAYMENT_METHODS = new Set(['cash', 'card', 'mercadopago']);

async function saleAuthor(user: AuthRequest['user']): Promise<{ userId: number | null; name: string | null }> {
  if (!user) return { userId: null, name: null };
  let name = user.name?.trim() || null;
  if (user.barberId) {
    const barber = await getBarberById(user.barberId);
    const barberName = barber?.name?.trim();
    if (barberName) name = barberName;
  }
  return { userId: user.id, name };
}

async function resolveSaleLines(raw: unknown, allowEmpty: boolean): Promise<AppointmentProductLine[]> {
  if (raw == null || (Array.isArray(raw) && raw.length === 0)) {
    if (allowEmpty) return [];
    throw new Error('Agregá al menos un producto.');
  }
  if (!Array.isArray(raw)) throw new Error('Productos no válidos.');
  if (raw.length > MAX_APPOINTMENT_PRODUCT_LINES) {
    throw new Error(`Demasiados productos (máx ${MAX_APPOINTMENT_PRODUCT_LINES}).`);
  }
  const merged = new Map<string, number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') throw new Error('Productos no válidos.');
    const obj = item as Record<string, unknown>;
    const productId = typeof obj.productId === 'string' ? obj.productId.trim() : '';
    const qty = Math.floor(Number(obj.quantity));
    if (!productId) throw new Error('Falta el producto en alguna línea.');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('La cantidad debe ser un entero mayor a 0.');
    merged.set(productId, (merged.get(productId) ?? 0) + qty);
  }
  const lines: AppointmentProductLine[] = [];
  for (const [productId, quantity] of merged.entries()) {
    const product = await getShopProductById(productId);
    if (!product) throw new Error('Hay un producto que ya no está en el catálogo.');
    const unit = parseArsAmount(product.unitPrice);
    if (unit == null || unit <= 0) {
      throw new Error(`«${product.name}» no tiene precio de venta.`);
    }
    const unitPrice = Math.round(unit);
    lines.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      subtotal: unitPrice * quantity,
    });
  }
  return lines;
}

router.get('/', async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from.slice(0, 10) : '';
  const to = typeof req.query.to === 'string' ? req.query.to.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'Se requieren from y to (yyyy-MM-dd)' });
  }
  try {
    res.json({ items: await repo.listCounterSalesInRange(from, to) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar ventas' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const body = req.body as {
    saleDate?: string;
    buyerName?: string | null;
    clientUserId?: number | null;
    paymentMethod?: string;
    products?: unknown;
    subscriptionPlanId?: string | null;
  };
  const saleDate = String(body.saleDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return res.status(400).json({ error: 'Fecha inválida.' });
  }
  const paymentMethod = String(body.paymentMethod ?? '');
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({ error: 'Elegí efectivo, tarjeta o Mercado Pago.' });
  }
  let buyerName = typeof body.buyerName === 'string' ? body.buyerName.trim().slice(0, 120) : '';
  const planId = typeof body.subscriptionPlanId === 'string' ? body.subscriptionPlanId.trim() : '';
  const clientUserId = Number(body.clientUserId);
  const hasClient = Number.isFinite(clientUserId) && clientUserId > 0;
  try {
    if (await isDailyCashCloseDate(saleDate)) {
      return res.status(409).json({ error: 'Este día está cerrado. Reabrí la caja para registrar la venta.' });
    }
    const lines = await resolveSaleLines(body.products, Boolean(planId));
    if (!planId && lines.length === 0) {
      return res.status(400).json({ error: 'Agregá un producto o un abono.' });
    }
    if (planId && !hasClient) {
      return res.status(400).json({ error: 'La venta de un abono tiene que asignarse a un cliente.' });
    }

    let clientName: string | null = null;
    if (hasClient) {
      const client = await findUserById(clientUserId);
      if (!client || client.role !== 'client') {
        return res.status(400).json({ error: 'Cliente no encontrado.' });
      }
      clientName = client.name?.trim() || null;
      if (!buyerName && clientName) buyerName = clientName.slice(0, 120);
    }

    if (lines.length > 0) await syncAppointmentProductStock(null, lines);
    let purchased: Awaited<ReturnType<typeof purchaseSubscriptionPlanForClient>> | null = null;
    try {
      if (planId) {
        purchased = await purchaseSubscriptionPlanForClient(clientUserId, planId);
      }
      const author = await saleAuthor(req.user);
      const item = await repo.createCounterSale({
        saleDate,
        buyerName: buyerName || null,
        clientUserId: hasClient ? clientUserId : null,
        paymentMethod: paymentMethod as repo.CounterSalePaymentMethod,
        products: lines,
        subscriptionPlanId: purchased ? planId : null,
        subscriptionPlanName: purchased?.planName ?? null,
        subscriptionGroupId: purchased?.groupId ?? null,
        subscriptionAmountArs: purchased?.priceArs ?? 0,
        createdByUserId: author.userId,
        createdByName: author.name,
      });
      if (purchased) void notifyClientSubscriptionActivated(clientUserId);
      res.status(201).json({ item });
    } catch (err) {
      if (purchased) {
        await revokePurchasedSubscription(clientUserId, purchased.groupId).catch(() => undefined);
      }
      if (lines.length > 0) await syncAppointmentProductStock(lines, null).catch(() => undefined);
      throw err;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo guardar la venta';
    res.status(400).json({ error: msg });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const existing = await repo.getCounterSaleById(id);
    if (!existing) return res.status(404).json({ error: 'Venta no encontrada' });
    if (existing.saleChannel === 'web') {
      return res.status(409).json({
        error: 'Los abonos pagados desde la web ya entraron por Mercado Pago y no se anulan desde la caja.',
      });
    }
    if (await isDailyCashCloseDate(existing.saleDate)) {
      return res.status(409).json({ error: 'Este día está cerrado. Reabrí la caja para anular la venta.' });
    }
    if (existing.subscriptionGroupId != null && existing.clientUserId != null) {
      await revokePurchasedSubscription(existing.clientUserId, existing.subscriptionGroupId);
    }
    await syncAppointmentProductStock(existing.products, null);
    const ok = await repo.deleteCounterSale(id);
    if (!ok) return res.status(404).json({ error: 'Venta no encontrada' });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'No se pudo anular la venta';
    res.status(400).json({ error: msg });
  }
});

export default router;
