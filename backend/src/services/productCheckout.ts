import { getShopProductById } from '../repositories/shopProducts.js';
import type { ProductOrderLine } from '../types.js';

function parseArsAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized = cleaned;
  if (hasDot && hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/\./g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export async function resolveProductOrderLines(
  items: { productId: string; quantity: number }[]
): Promise<{ lines: ProductOrderLine[]; totalArs: number; pointsEarned: number }> {
  if (!items.length) throw new Error('El pedido está vacío');
  if (items.length > 20) throw new Error('Demasiados productos en el pedido');

  const lines: ProductOrderLine[] = [];
  let totalArs = 0;
  let pointsEarned = 0;

  for (const item of items) {
    const productId = String(item.productId ?? '').trim();
    const qty = Math.floor(Number(item.quantity));
    if (!productId || !Number.isFinite(qty) || qty <= 0 || qty > 99) {
      throw new Error('Cantidad inválida en el pedido');
    }

    const product = await getShopProductById(productId);
    if (!product || !product.webActive) {
      throw new Error(`Producto no disponible: ${productId}`);
    }
    const unitPrice = parseArsAmount(product.unitPrice ?? undefined);
    if (unitPrice == null) {
      throw new Error(`«${product.name}» no tiene precio para venta online`);
    }
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    totalArs += subtotal;
    pointsEarned += (product.pointsReward ?? 0) * qty;
    lines.push({
      productId: product.id,
      name: product.name,
      quantity: qty,
      unitPrice,
      subtotal,
      imageUrl: product.imageUrl ?? null,
    });
  }

  totalArs = Math.round(totalArs * 100) / 100;
  if (totalArs <= 0) throw new Error('Total del pedido inválido');
  return { lines, totalArs, pointsEarned };
}
