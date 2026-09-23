import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Pencil, Package, ShoppingCart, Loader2 } from 'lucide-react';
import { api, ApiError } from '../api';
import type { ProductPurchase, ShopProduct } from '../api';
import { formatArs } from '../utils/money';

function asProductList(data: unknown): ShopProduct[] {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];
  const out: ShopProduct[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as ShopProduct;
    if (typeof row.id !== 'string' || !row.id || typeof row.name !== 'string' || !row.name.trim()) continue;
    out.push(row);
  }
  return out;
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : fallback;
}

type Props = {
  fromYmd: string;
  toYmd: string;
  onTotalChange?: (total: number) => void;
};

export default function ProductPurchasesPanel({ fromYmd, toYmd, onTotalChange }: Props) {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<ProductPurchase[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCost, setNewProductCost] = useState('');

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(fromYmd);
  const [notes, setNotes] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editProductId, setEditProductId] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnitCost, setEditUnitCost] = useState('');
  const [editPurchaseDate, setEditPurchaseDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const total = purchases.reduce((sum, p) => sum + p.totalCost, 0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [purchasesResult, productsResult] = await Promise.allSettled([
      api.getProductPurchases(fromYmd, toYmd),
      api.getShopProducts(),
    ]);

    const messages: string[] = [];
    if (productsResult.status === 'fulfilled') {
      setProducts(asProductList(productsResult.value));
    } else {
      setProducts([]);
      messages.push(errorMessage(productsResult.reason, 'No se pudo cargar el catálogo de productos'));
    }
    if (purchasesResult.status === 'fulfilled') {
      setPurchases(purchasesResult.value.items ?? []);
    } else {
      messages.push(errorMessage(purchasesResult.reason, 'No se pudieron cargar las compras'));
    }
    setErr(messages.join(' · '));
    setLoading(false);
  }, [fromYmd, toYmd]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  useEffect(() => {
    setPurchaseDate(fromYmd);
  }, [fromYmd]);

  const run = async (fn: () => Promise<void>) => {
    setErr('');
    setSaving(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const goToCatalog = () => {
    navigate('/dashboard', { state: { openView: 'productos' } });
  };

  const handleCreateProduct = () => {
    const name = newProductName.trim();
    if (!name) {
      setErr('Escribí el nombre del producto');
      return;
    }
    const price = newProductPrice.trim();
    const cost = newProductCost.trim();
    void run(async () => {
      const created = await api.createShopProduct({
        name,
        pointsReward: 0,
        unitPrice: price || null,
        cost: cost || null,
      });
      setNewProductName('');
      setNewProductPrice('');
      setNewProductCost('');
      setShowNewProduct(false);
      setProductId(created.id);
      if (cost) setUnitCost(cost.replace(',', '.'));
      else if (created.cost) setUnitCost(String(created.cost));
    });
  };

  const handleAdd = () => {
    const qty = Math.max(1, Math.floor(Number(quantity)));
    const cost = parseFloat(String(unitCost).replace(',', '.'));
    void run(async () => {
      await api.createProductPurchase({
        productId,
        quantity: qty,
        unitCost: cost,
        purchaseDate,
        notes: notes.trim() || undefined,
      });
      setProductId('');
      setQuantity('1');
      setUnitCost('');
      setNotes('');
    });
  };

  const startEdit = (p: ProductPurchase) => {
    setEditingId(p.id);
    setEditProductId(p.productId);
    setEditQuantity(String(p.quantity));
    setEditUnitCost(String(p.unitCost));
    setEditPurchaseDate(p.purchaseDate);
    setEditNotes(p.notes ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = () => {
    if (editingId === null) return;
    const qty = Math.max(1, Math.floor(Number(editQuantity)));
    const cost = parseFloat(String(editUnitCost).replace(',', '.'));
    void run(async () => {
      await api.updateProductPurchase(editingId, {
        productId: editProductId,
        quantity: qty,
        unitCost: cost,
        purchaseDate: editPurchaseDate,
        notes: editNotes.trim() || null,
      });
      setEditingId(null);
    });
  };

  const handleDelete = (p: ProductPurchase) => {
    if (!window.confirm(`¿Eliminar la compra de «${p.productName}»?`)) return;
    void run(() => api.deleteProductPurchase(p.id).then(() => {}));
  };

  const selectedProduct = products.find((p) => p.id === productId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando compras de productos…
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-zinc-100 px-5 py-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShoppingCart className="text-[#b39055]" size={20} />
          <h2 className="text-lg font-black text-zinc-900">Compras de productos</h2>
        </div>
        <p className="text-xs text-zinc-500">
          Total en período: <span className="font-bold text-red-800">${formatArs(total)}</span>
        </p>
      </div>

      {err && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">{err}</div>
      )}

      <div className="p-5 border-b border-zinc-100 bg-zinc-50/80">
        <p className="text-xs text-zinc-600 mb-3">
          Registrá las compras de productos (reposición de stock) para calcular los gastos. El desplegable usa el
          catálogo del menú{' '}
          <button type="button" onClick={goToCatalog} className="font-bold text-zinc-900 underline">
            Productos
          </button>
          .
        </p>

        {products.length === 0 && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            No hay productos en el catálogo para elegir. Creá el primero acá, o cargalo en Productos con nombre, precio,
            foto y stock.
          </div>
        )}

        {showNewProduct || products.length === 0 ? (
          <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase text-zinc-400">Nuevo producto</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 items-end">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">Nombre</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Ej. Pomada matte"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">Precio venta</label>
                <input
                  type="text"
                  value={newProductPrice}
                  onChange={(e) => setNewProductPrice(e.target.value)}
                  placeholder="Opcional"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">Costo</label>
                <input
                  type="text"
                  value={newProductCost}
                  onChange={(e) => setNewProductCost(e.target.value)}
                  placeholder="Opcional"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-4">
                <button
                  type="button"
                  disabled={saving || !newProductName.trim()}
                  onClick={handleCreateProduct}
                  className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Plus size={16} />
                  Crear producto
                </button>
                {products.length > 0 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setShowNewProduct(false)}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold text-zinc-600"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewProduct(true)}
            className="mb-3 text-xs font-bold text-zinc-800 underline"
          >
            + Nuevo producto
          </button>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
          <div className="col-span-1">
            <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Fecha</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              min={fromYmd}
              max={toYmd}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2 sm:col-span-2 lg:col-span-2">
            <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Producto</label>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const selected = products.find((p) => p.id === e.target.value);
                if (selected?.cost) {
                  setUnitCost(selected.cost);
                }
              }}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">
                {products.length === 0 ? 'Sin productos en el catálogo' : 'Seleccionar producto'}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-1">
            <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Cantidad</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1 truncate">
              Costo unit.
            </label>
            <input
              type="number"
              min={0}
              step={100}
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder={selectedProduct?.cost ?? ''}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div className="col-span-2 sm:col-span-1 lg:col-span-1">
            <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2 sm:col-span-3 lg:col-span-6">
            <button
              type="button"
              disabled={saving || !productId || !unitCost}
              onClick={handleAdd}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              <Plus size={16} />
              Registrar compra
            </button>
          </div>
        </div>
      </div>

      {purchases.length === 0 ? (
        <p className="px-5 py-6 text-sm text-zinc-500">Sin compras de productos en este período.</p>
      ) : (
        <>
          {/* Vista móvil - Lista de tarjetas */}
          <div className="md:hidden divide-y divide-zinc-100">
            {purchases.map((p) =>
              editingId === p.id ? (
                <div key={p.id} className="p-4 bg-amber-50/50 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Fecha</label>
                      <input
                        type="date"
                        value={editPurchaseDate}
                        onChange={(e) => setEditPurchaseDate(e.target.value)}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Producto</label>
                      <select
                        value={editProductId}
                        onChange={(e) => setEditProductId(e.target.value)}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      >
                        {products.map((pr) => (
                          <option key={pr.id} value={pr.id}>{pr.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Cantidad</label>
                      <input
                        type="number"
                        min={1}
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(e.target.value)}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Costo unit.</label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={editUnitCost}
                        onChange={(e) => setEditUnitCost(e.target.value)}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Notas</label>
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={saveEdit}
                      className="flex-1 px-3 py-2 text-xs font-bold bg-zinc-900 text-white rounded-lg"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={cancelEdit}
                      className="flex-1 px-3 py-2 text-xs font-bold border border-zinc-200 rounded-lg"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Package size={14} className="text-zinc-400 shrink-0" />
                        <p className="font-medium text-zinc-900 break-words">{p.productName}</p>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{p.purchaseDate}</p>
                      {p.notes && <p className="mt-0.5 text-xs text-zinc-400">{p.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => startEdit(p)}
                        className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg"
                        aria-label="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDelete(p)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                        aria-label="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className="text-zinc-600">Cant: {p.quantity}</span>
                    <span className="text-zinc-600">C. unit: ${formatArs(p.unitCost)}</span>
                    <span className="font-semibold text-red-800">Total: ${formatArs(p.totalCost)}</span>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Vista desktop - Tabla */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 text-[11px] font-bold uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2 text-right">Cant.</th>
                  <th className="px-4 py-2 text-right">C. unit.</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Notas</th>
                  <th className="px-4 py-2 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {purchases.map((p) =>
                  editingId === p.id ? (
                    <tr key={p.id} className="bg-amber-50/50">
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={editPurchaseDate}
                          onChange={(e) => setEditPurchaseDate(e.target.value)}
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editProductId}
                          onChange={(e) => setEditProductId(e.target.value)}
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                        >
                          {products.map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              {pr.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={1}
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          className="w-16 rounded border border-zinc-200 px-2 py-1 text-sm text-right"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={editUnitCost}
                          onChange={(e) => setEditUnitCost(e.target.value)}
                          className="w-24 rounded border border-zinc-200 px-2 py-1 text-sm text-right"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-400">
                        ${formatArs(Math.max(1, Number(editQuantity)) * Number(editUnitCost))}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2 flex gap-1">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={saveEdit}
                          className="px-2 py-1 text-xs font-bold bg-zinc-900 text-white rounded"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={cancelEdit}
                          className="px-2 py-1 text-xs font-bold border border-zinc-200 rounded"
                        >
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id}>
                      <td className="px-4 py-2 tabular-nums text-zinc-600">{p.purchaseDate}</td>
                      <td className="px-4 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          <Package size={14} className="text-zinc-400" />
                          {p.productName}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.quantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums">${formatArs(p.unitCost)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-800">
                        ${formatArs(p.totalCost)}
                      </td>
                      <td className="px-4 py-2 text-zinc-500 text-xs">{p.notes ?? ''}</td>
                      <td className="px-4 py-2 flex gap-1">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => startEdit(p)}
                          className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg"
                          aria-label="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleDelete(p)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          aria-label="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
