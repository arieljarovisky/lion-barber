import React, { useState } from 'react';
import { Gift, Loader2, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import type { PointsRedemptionOption } from '../api';
import { useConfirm } from '../contexts/ConfirmContext';

type PointsRedemptionPanelProps = {
  options: PointsRedemptionOption[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

/** Configuración de para qué pueden usarse los puntos al canjear (beneficios / recompensas). */
export default function PointsRedemptionPanel({
  options,
  loading,
  onRefresh,
  showToast,
}: PointsRedemptionPanelProps) {
  const confirm = useConfirm();
  const [newLabel, setNewLabel] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { label: string; points: string }>>({});

  const getDraft = (o: PointsRedemptionOption) =>
    drafts[o.id] ?? { label: o.label, points: String(o.pointsCost) };

  const addOption = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    const n = parseInt(newPoints, 10);
    if (!label) {
      showToast('Describí qué obtiene el cliente al canjear', 'err');
      return;
    }
    if (!Number.isFinite(n) || n < 1) {
      showToast('Los puntos necesarios deben ser un número ≥ 1', 'err');
      return;
    }
    setAdding(true);
    try {
      await api.createPointsRedemptionOption({ label, pointsCost: n });
      setNewLabel('');
      setNewPoints('');
      showToast('Opción de canje agregada');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo crear', 'err');
    } finally {
      setAdding(false);
    }
  };

  const saveRow = async (o: PointsRedemptionOption) => {
    const d = getDraft(o);
    const label = d.label.trim();
    const n = parseInt(d.points, 10);
    if (!label) {
      showToast('La descripción no puede estar vacía', 'err');
      return;
    }
    if (!Number.isFinite(n) || n < 1) {
      showToast('Los puntos deben ser ≥ 1', 'err');
      return;
    }
    setSavingId(o.id);
    try {
      await api.updatePointsRedemptionOption(o.id, { label, pointsCost: n });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[o.id];
        return next;
      });
      showToast('Guardado');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo guardar', 'err');
    } finally {
      setSavingId(null);
    }
  };

  const removeRow = async (o: PointsRedemptionOption) => {
    const { confirmed: ok } = await confirm({
      title: 'Quitar opción de canje',
      message: `¿Eliminar “${o.label}”?`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    setDeletingId(o.id);
    try {
      await api.deletePointsRedemptionOption(o.id);
      showToast('Opción eliminada');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo eliminar', 'err');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Cargando canjes…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-4">
      <div className="mb-4 flex items-center gap-2">
        <Gift className="h-6 w-6 text-violet-700" aria-hidden />
        <h3 className="text-lg font-black text-zinc-900">Para qué canjear puntos</h3>
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Definí qué beneficios puede elegir el cliente según los puntos que acumule. Esto sirve como reglas del programa
        (el canje en el local puede ser manual hasta integrar canje online).
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-100">
        <table className="w-full min-w-[300px] text-left text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Beneficio</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Puntos</th>
              <th className="w-24 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {options.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-5 text-center text-zinc-500 text-xs">
                  Todavía no cargaste recompensas. Agregá la primera abajo.
                </td>
              </tr>
            ) : (
              options.map((o) => {
                const d = getDraft(o);
                return (
                  <tr key={o.id} className="bg-white align-top">
                    <td className="px-3 py-2">
                      <textarea
                        value={d.label}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [o.id]: { ...d, label: e.target.value },
                          }))
                        }
                        rows={2}
                        className="w-full min-w-0 rounded-lg border border-zinc-200 px-2 py-1.5 text-zinc-900 text-sm resize-y"
                        aria-label={`Descripción del canje ${o.id}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        max={999999}
                        value={d.points}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [o.id]: { ...d, points: e.target.value },
                          }))
                        }
                        className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-right font-mono text-zinc-900"
                        aria-label="Puntos necesarios"
                      />
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-end">
                        <button
                          type="button"
                          disabled={savingId === o.id}
                          onClick={() => void saveRow(o)}
                          className="rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {savingId === o.id ? '…' : 'Guardar'}
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === o.id}
                          onClick={() => void removeRow(o)}
                          className="text-red-600 hover:text-red-800 p-1 disabled:opacity-50"
                          aria-label="Eliminar opción"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={addOption} className="mt-4 space-y-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Nueva recompensa</p>
        <div>
          <label className="block text-[11px] font-bold text-zinc-500 mb-1">Qué obtiene el cliente</label>
          <textarea
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            rows={2}
            placeholder="Ej. 10% de descuento en el próximo servicio"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-zinc-500 mb-1">Puntos necesarios</label>
          <input
            type="number"
            min={1}
            max={999999}
            value={newPoints}
            onChange={(e) => setNewPoints(e.target.value)}
            className="w-full max-w-[140px] rounded-lg border border-zinc-200 px-3 py-2 font-mono text-zinc-900"
            placeholder="500"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="w-full sm:w-auto rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50"
        >
          {adding ? 'Agregando…' : 'Agregar a la lista'}
        </button>
      </form>
    </div>
  );
}
