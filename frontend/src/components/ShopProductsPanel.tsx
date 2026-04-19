import React, { useState } from 'react';
import { Loader2, Pencil, ShoppingBag, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import type { ShopProduct } from '../api';

type ShopProductsPanelProps = {
  shopProducts: ShopProduct[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

export default function ShopProductsPanel({
  shopProducts,
  loading,
  onRefresh,
  showToast,
}: ShopProductsPanelProps) {
  const [productName, setProductName] = useState('');
  const [productPoints, setProductPoints] = useState('10');
  const [productUnitPrice, setProductUnitPrice] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPoints, setEditPoints] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = productName.trim();
    const pts = parseInt(productPoints, 10);
    if (!name) {
      showToast('Escribí el nombre del producto', 'err');
      return;
    }
    if (!Number.isFinite(pts) || pts < 0) {
      showToast('Los puntos deben ser ≥ 0', 'err');
      return;
    }
    setSavingProduct(true);
    try {
      const up = productUnitPrice.trim();
      await api.createShopProduct({
        name,
        pointsReward: pts,
        unitPrice: up ? up : undefined,
      });
      setProductName('');
      setProductPoints('10');
      setProductUnitPrice('');
      showToast('Producto agregado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo crear el producto', 'err');
    } finally {
      setSavingProduct(false);
    }
  };

  const startEditProduct = (p: ShopProduct) => {
    setEditingProductId(p.id);
    setEditName(p.name);
    setEditPoints(String(p.pointsReward));
    setEditUnitPrice(p.unitPrice ?? '');
  };

  const saveEditProduct = async (id: string) => {
    const name = editName.trim();
    const pts = parseInt(editPoints, 10);
    if (!name) {
      showToast('El nombre no puede estar vacío', 'err');
      return;
    }
    if (!Number.isFinite(pts) || pts < 0) {
      showToast('Puntos inválidos', 'err');
      return;
    }
    try {
      const up = editUnitPrice.trim();
      await api.updateShopProduct(id, {
        name,
        pointsReward: pts,
        unitPrice: up ? up : null,
      });
      setEditingProductId(null);
      showToast('Producto actualizado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error al guardar', 'err');
    }
  };

  const removeProduct = async (id: string) => {
    if (!window.confirm('¿Eliminar este producto de la lista de puntos?')) return;
    try {
      await api.deleteShopProduct(id);
      showToast('Producto eliminado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo eliminar', 'err');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Cargando productos…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-emerald-700" aria-hidden />
          <h3 className="text-lg font-black text-zinc-900">Puntos por producto</h3>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Agregá productos que vendés en el local (pomadas, shampoos, etc.), puntos por compra y, si facturás con AFIP,
          el precio de venta unitario en pesos.
        </p>

        <ul className="mb-6 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {shopProducts.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-zinc-500">Todavía no cargaste productos.</li>
          ) : (
            shopProducts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                {editingProductId === p.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="min-w-[8rem] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      value={editPoints}
                      onChange={(e) => setEditPoints(e.target.value)}
                      className="w-24 rounded-lg border border-zinc-200 px-2 py-2 text-right font-mono text-sm"
                      title="Puntos"
                    />
                    <input
                      value={editUnitPrice}
                      onChange={(e) => setEditUnitPrice(e.target.value)}
                      placeholder="$ venta"
                      className="w-28 rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                      title="Precio venta unitario"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEditProduct(p.id)}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProductId(null)}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-zinc-900">{p.name}</span>
                    <span className="font-mono text-sm font-bold text-[#b39055]">+{p.pointsReward} pts</span>
                    {p.unitPrice ? (
                      <span className="text-xs text-zinc-500">Venta: {p.unitPrice}</span>
                    ) : (
                      <span className="text-xs text-zinc-400">Sin precio venta</span>
                    )}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEditProduct(p)}
                        className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                        aria-label={`Editar ${p.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeProduct(p.id)}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                        aria-label={`Eliminar ${p.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))
          )}
        </ul>

        <form onSubmit={addProduct} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Nuevo producto</label>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Ej. Pomada matte"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Puntos</label>
            <input
              type="number"
              min={0}
              value={productPoints}
              onChange={(e) => setProductPoints(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:w-28"
            />
          </div>
          <div className="sm:min-w-[7rem]">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Precio venta</label>
            <input
              value={productUnitPrice}
              onChange={(e) => setProductUnitPrice(e.target.value)}
              placeholder="Ej. 15000"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={savingProduct}
            className="rounded-xl bg-[#e5c185] px-5 py-2.5 text-sm font-bold text-zinc-950 hover:bg-[#d4b074] disabled:opacity-50"
          >
            {savingProduct ? 'Agregando…' : 'Agregar'}
          </button>
        </form>
      </div>
    </div>
  );
}
