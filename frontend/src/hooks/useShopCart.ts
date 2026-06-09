import { useCallback, useMemo, useState } from 'react';
import type { ShopProduct } from '../api';
import { parseArsAmount } from '../utils/money';

export type ShopCartLine = { product: ShopProduct; quantity: number };

function productMaxQty(product: ShopProduct): number {
  if (product.stock == null) return 99;
  return Math.min(99, Math.max(0, product.stock));
}

export function useShopCart(products: ShopProduct[]) {
  const [cart, setCart] = useState<Record<string, number>>({});

  const cartLines = useMemo(() => {
    const lines: ShopCartLine[] = [];
    for (const product of products) {
      const qty = cart[product.id] ?? 0;
      if (qty > 0) lines.push({ product, quantity: qty });
    }
    return lines;
  }, [cart, products]);

  const cartTotal = useMemo(() => {
    return cartLines.reduce((sum, line) => {
      const price = parseArsAmount(line.product.unitPrice ?? undefined);
      if (price == null) return sum;
      return sum + price * line.quantity;
    }, 0);
  }, [cartLines]);

  const cartCount = cartLines.reduce((n, l) => n + l.quantity, 0);

  const setQty = useCallback(
    (productId: string, quantity: number) => {
      const product = products.find((p) => p.id === productId);
      const max = product ? productMaxQty(product) : 99;
      setCart((prev) => {
        const next = { ...prev };
        if (quantity <= 0) delete next[productId];
        else next[productId] = Math.min(max, quantity);
        return next;
      });
    },
    [products]
  );

  const clearCart = useCallback(() => setCart({}), []);

  const cartItemsPayload = useMemo(
    () => cartLines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    [cartLines]
  );

  return {
    cart,
    cartLines,
    cartTotal,
    cartCount,
    setQty,
    clearCart,
    cartItemsPayload,
  };
}
