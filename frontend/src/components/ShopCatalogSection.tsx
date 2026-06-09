import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, ShoppingCart } from 'lucide-react';
import { Wallet } from '@mercadopago/sdk-react';
import { api, ApiError } from '../api';
import type { ShopProduct } from '../api';
import { parseArsAmount } from '../utils/money';
import { resolveUploadUrl } from '../utils/mediaUrl';

type CartLine = { product: ShopProduct; quantity: number };

type ShopCatalogSectionProps = {
  products: ShopProduct[];
  isLoggedIn: boolean;
  onRequireLogin: () => void;
};

function productUnitPriceArs(product: ShopProduct): number | null {
  return parseArsAmount(product.unitPrice ?? undefined);
}

function productMaxQty(product: ShopProduct): number {
  if (product.stock == null) return 99;
  return Math.min(99, Math.max(0, product.stock));
}

export default function ShopCatalogSection({
  products,
  isLoggedIn,
  onRequireLogin,
}: ShopCatalogSectionProps) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [preferenceId, setPreferenceId] = useState<string | null>(null);

  const cartLines = useMemo(() => {
    const lines: CartLine[] = [];
    for (const product of products) {
      const qty = cart[product.id] ?? 0;
      if (qty > 0) lines.push({ product, quantity: qty });
    }
    return lines;
  }, [cart, products]);

  const cartTotal = useMemo(() => {
    return cartLines.reduce((sum, line) => {
      const price = productUnitPriceArs(line.product);
      if (price == null) return sum;
      return sum + price * line.quantity;
    }, 0);
  }, [cartLines]);

  const cartCount = cartLines.reduce((n, l) => n + l.quantity, 0);

  const setQty = (productId: string, quantity: number) => {
    const product = products.find((p) => p.id === productId);
    const max = product ? productMaxQty(product) : 99;
    setCart((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[productId];
      else next[productId] = Math.min(max, quantity);
      return next;
    });
    setPreferenceId(null);
    setCheckoutError('');
  };

  const handleCheckout = async () => {
    if (cartLines.length === 0) return;
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    setCheckoutLoading(true);
    setCheckoutError('');
    setPreferenceId(null);
    try {
      const result = await api.createCheckoutProducts(
        cartLines.map((l) => ({ productId: l.product.id, quantity: l.quantity }))
      );
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setPreferenceId(result.preferenceId);
    } catch (e) {
      setCheckoutError(e instanceof ApiError ? e.message : 'No se pudo iniciar el pago');
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (products.length === 0) return null;

  return (
    <section id="productos" className="border-y border-zinc-900 bg-zinc-950 px-4 py-12 sm:px-6 sm:py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center sm:mb-12">
          <h2 className="mb-3 px-2 font-serif text-2xl font-black uppercase tracking-tight text-white sm:text-3xl md:text-4xl">
            Productos
          </h2>
          <div className="mx-auto h-1 w-20 rounded-full bg-[#e5c185] sm:w-24" />
          <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
            Comprá online con Mercado Pago y retirá en Lion Barber.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-6 lg:grid-cols-3">
          {products.map((product) => {
            const price = productUnitPriceArs(product);
            const qty = cart[product.id] ?? 0;
            const imageSrc = resolveUploadUrl(product.imageUrl);
            return (
              <article
                key={product.id}
                className="flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 sm:rounded-2xl"
              >
                <div className="aspect-square overflow-hidden bg-zinc-950">
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-700">
                      <ShoppingBag className="h-8 w-8 sm:h-12 sm:w-12" strokeWidth={1.25} aria-hidden />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-2.5 sm:p-6">
                  <h3 className="line-clamp-2 font-serif text-xs font-bold leading-tight text-white sm:text-xl">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="mt-1 line-clamp-2 text-[10px] font-light text-zinc-400 sm:mt-2 sm:line-clamp-3 sm:text-sm">
                      {product.description}
                    </p>
                  )}
                  {product.stock != null && (
                    <p className="mt-1 text-[10px] font-semibold text-zinc-500 sm:text-xs">
                      {product.stock <= 5 ? `Quedan ${product.stock}` : `${product.stock} disponibles`}
                    </p>
                  )}
                  <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3 sm:pt-4">
                    <span className="font-sans text-sm font-black text-[#e5c185] sm:text-2xl">
                      {price != null ? `$${price.toLocaleString('es-AR')}` : product.unitPrice}
                    </span>
                    {qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => setQty(product.id, 1)}
                        className="w-full rounded-md bg-[#e5c185] px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 hover:bg-[#d4b074] sm:w-auto sm:rounded-lg sm:px-4 sm:py-2 sm:text-xs sm:tracking-wider"
                      >
                        Agregar
                      </button>
                    ) : (
                      <div className="flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 sm:w-auto sm:gap-2 sm:rounded-lg sm:px-2 sm:py-1">
                        <button
                          type="button"
                          onClick={() => setQty(product.id, qty - 1)}
                          className="rounded p-0.5 text-zinc-400 hover:text-white sm:p-1"
                          aria-label="Quitar uno"
                        >
                          <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                        <span className="min-w-[1.25rem] text-center text-xs font-bold text-white sm:min-w-[1.5rem] sm:text-sm">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(product.id, qty + 1)}
                          className="rounded p-0.5 text-zinc-400 hover:text-white sm:p-1"
                          aria-label="Agregar uno"
                        >
                          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {cartCount > 0 && (
          <div className="sticky bottom-4 z-30 mx-auto mt-8 max-w-lg rounded-2xl border border-[#e5c185]/30 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <ShoppingCart size={18} className="text-[#e5c185]" aria-hidden />
                {cartCount} {cartCount === 1 ? 'producto' : 'productos'}
              </span>
              <span className="font-sans text-lg font-black text-[#e5c185] tabular-nums">
                ${Math.round(cartTotal).toLocaleString('es-AR')}
              </span>
            </div>
            {!isLoggedIn ? (
              <p className="mb-3 text-center text-xs text-zinc-400">
                <button type="button" onClick={onRequireLogin} className="font-bold text-[#e5c185] underline">
                  Iniciá sesión
                </button>{' '}
                para pagar con Mercado Pago.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleCheckout()}
              disabled={checkoutLoading}
              className="w-full rounded-xl bg-[#e5c185] py-3.5 text-sm font-black uppercase tracking-wider text-zinc-950 hover:bg-[#d4b074] disabled:opacity-60"
            >
              {checkoutLoading ? 'Preparando pago…' : 'Pagar con Mercado Pago'}
            </button>
            {checkoutError && <p className="mt-2 text-center text-xs text-red-400">{checkoutError}</p>}
            {preferenceId && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <Wallet
                  initialization={{ preferenceId, redirectMode: 'self' }}
                  locale="es-AR"
                  customization={{ theme: 'dark' }}
                  onError={(err) => setCheckoutError(err.message || 'Error al cargar Mercado Pago')}
                />
              </div>
            )}
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              Retirás tu pedido en el local. Podés ver el estado en{' '}
              <Link to="/perfil" className="text-[#e5c185] underline">
                tu perfil
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
