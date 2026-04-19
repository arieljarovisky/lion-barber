import React, { useState } from 'react';
import { Award, Loader2 } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Service } from '../api';

type PointsProgramPanelProps = {
  services: Service[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

export default function PointsProgramPanel({
  services,
  loading,
  onRefresh,
  showToast,
}: PointsProgramPanelProps) {
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
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
          futura). Los valores quedan guardados por servicio. Los productos de venta se configuran más abajo en esta
          misma pantalla.
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
    </div>
  );
}
