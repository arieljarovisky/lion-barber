import React, { useState } from 'react';
import { Award, Loader2 } from 'lucide-react';
import { api, ApiError } from '../api';
import type { ShopProduct } from '../api';

type ProductPointsPanelProps = {
  shopProducts: ShopProduct[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

/** Asignación de puntos por producto (misma idea que puntos por servicio). */
export default function ProductPointsPanel({
  shopProducts,
  loading,
  onRefresh,
  showToast,
}: ProductPointsPanelProps) {
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const getDraft = (id: string, fallback: number) => drafts[id] ?? String(fallback ?? 0);

  const saveProductPoints = async (id: string) => {
    const raw = drafts[id] ?? '0';
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
      showToast('Ingresá un número de puntos válido (≥ 0)', 'err');
      return;
    }
    setSavingProductId(id);
    try {
      await api.updateShopProduct(id, { pointsReward: n });
      setDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      showToast('Puntos del producto guardados');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo guardar', 'err');
    } finally {
      setSavingProductId(null);
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
    <div className="max-w-4xl">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Award className="h-6 w-6 text-emerald-700" aria-hidden />
          <h3 className="text-lg font-black text-zinc-900">Puntos por producto</h3>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Definí cuántos puntos suma cada producto cuando el cliente lo compra en el local. Los productos se crean y se
          editan en la sección <strong className="font-semibold text-zinc-700">Productos</strong>.
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Puntos</th>
                <th className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {shopProducts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                    No hay productos cargados. Creálos en la sección Productos.
                  </td>
                </tr>
              ) : (
                shopProducts.map((p) => (
                  <tr key={p.id} className="bg-white">
                    <td className="px-4 py-3 font-medium text-zinc-900">{p.name}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        max={999999}
                        value={getDraft(p.id, p.pointsReward ?? 0)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-right font-mono text-zinc-900"
                        aria-label={`Puntos para ${p.name}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={savingProductId === p.id}
                        onClick={() => void saveProductPoints(p.id)}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {savingProductId === p.id ? '…' : 'Guardar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
