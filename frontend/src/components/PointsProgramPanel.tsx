import React, { useState } from 'react';
import { Award, Loader2, Pencil, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Service, ShopProduct } from '../api';

type PointsProgramPanelProps = {
  services: Service[];
  shopProducts: ShopProduct[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

export default function PointsProgramPanel({
  services,
  shopProducts,
  loading,
  onRefresh,
  showToast,
}: PointsProgramPanelProps) {
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [productPoints, setProductPoints] = useState('10');
  const [savingProduct, setSavingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPoints, setEditPoints] = useState('');

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const getDraft = (id: string, fallback: number) => drafts[id] ?? String(fallback ?? 0);

  const saveServicePoints = async (id: string) => {
    const raw = drafts[id] ?? '0';
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
      showToast('Ingresá un número de puntos válido (≥ 0)', 'err');
      return;
    }
    setSavingServiceId(id);
    try {
      await api.updateServicePointsReward(id, n);
      setDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      showToast('Puntos del servicio guardados');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo guardar', 'err');
    } finally {
      setSavingServiceId(null);
    }
  };

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
      await api.createShopProduct({ name, pointsReward: pts });
      setProductName('');
      setProductPoints('10');
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
      await api.updateShopProduct(id, { name, pointsReward: pts });
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
        Cargando programa de puntos…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Award className="h-6 w-6 text-[#b39055]" aria-hidden />
          <h3 className="text-lg font-black text-zinc-900">Puntos por servicio</h3>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Definí cuántos puntos suma cada servicio cuando el cliente lo abona en el local (gestión manual o integración
          futura). Los valores quedan guardados por servicio.
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Servicio</th>
                <th className="px-4 py-3 text-right">Puntos</th>
                <th className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {services.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                    No hay servicios cargados. El administrador puede crearlos en la sección Servicios.
                  </td>
                </tr>
              ) : (
                services.map((s) => (
                  <tr key={s.id} className="bg-white">
                    <td className="px-4 py-3 font-medium text-zinc-900">{s.name}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        max={999999}
                        value={getDraft(s.id, s.pointsReward ?? 0)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                        className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-right font-mono text-zinc-900"
                        aria-label={`Puntos para ${s.name}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={savingServiceId === s.id}
                        onClick={() => void saveServicePoints(s.id)}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {savingServiceId === s.id ? '…' : 'Guardar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Award className="h-6 w-6 text-emerald-700" aria-hidden />
          <h3 className="text-lg font-black text-zinc-900">Puntos por producto</h3>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Agregá productos que vendés en el local (pomadas, shampoos, etc.) y cuántos puntos suma cada compra.
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
