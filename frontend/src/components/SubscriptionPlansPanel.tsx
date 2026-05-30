import React, { useState } from 'react';
import { Loader2, Pencil, Repeat, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import { useConfirm } from '../contexts/ConfirmContext';
import type { SubscriptionPlan } from '../api';

type SubscriptionPlansPanelProps = {
  plans: SubscriptionPlan[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

export default function SubscriptionPlansPanel({
  plans,
  loading,
  onRefresh,
  showToast,
}: SubscriptionPlansPanelProps) {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [cutsPerMonth, setCutsPerMonth] = useState('4');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCuts, setEditCuts] = useState('');
  const [editActive, setEditActive] = useState(true);

  const addPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Escribí el nombre del plan', 'err');
      return;
    }
    const price = monthlyPrice.trim();
    if (!price) {
      showToast('Indicá el precio mensual', 'err');
      return;
    }
    const cuts = parseInt(cutsPerMonth, 10);
    if (!Number.isFinite(cuts) || cuts < 1) {
      showToast('Los cortes por mes deben ser al menos 1', 'err');
      return;
    }
    setSaving(true);
    try {
      await api.createSubscriptionPlan({
        name: trimmed,
        monthlyPrice: price,
        cutsPerMonth: cuts,
      });
      setName('');
      setMonthlyPrice('');
      setCutsPerMonth('4');
      showToast('Plan creado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo crear el plan', 'err');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: SubscriptionPlan) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPrice(p.monthlyPrice);
    setEditCuts(String(p.cutsPerMonth));
    setEditActive(p.active);
  };

  const saveEdit = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      showToast('El nombre no puede estar vacío', 'err');
      return;
    }
    const cuts = parseInt(editCuts, 10);
    if (!Number.isFinite(cuts) || cuts < 1) {
      showToast('Cortes por mes inválidos', 'err');
      return;
    }
    try {
      await api.updateSubscriptionPlan(id, {
        name: trimmed,
        monthlyPrice: editPrice.trim(),
        cutsPerMonth: cuts,
        active: editActive,
      });
      setEditingId(null);
      showToast('Plan actualizado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error al guardar', 'err');
    }
  };

  const removePlan = async (p: SubscriptionPlan) => {
    const ok = await confirm({
      title: 'Eliminar plan',
      message: `¿Eliminar «${p.name}»? Solo podés si ningún cliente lo tiene asignado.`,
    });
    if (!ok) return;
    try {
      await api.deleteSubscriptionPlan(p.id);
      showToast('Plan eliminado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo eliminar', 'err');
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5c185]/20 text-[#8a6d3b]">
          <Repeat size={22} />
        </div>
        <div>
          <h2 className="text-lg font-black text-zinc-900">Planes de abono</h2>
          <p className="text-sm text-zinc-500">
            Precio mensual de referencia y cantidad de cortes incluidos. Asignalos desde la ficha de cada cliente.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void addPlan(e)} className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (ej. 4 cortes)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:col-span-2"
        />
        <input
          type="text"
          value={monthlyPrice}
          onChange={(e) => setMonthlyPrice(e.target.value)}
          placeholder="Precio mensual ($80.000)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <input
          type="number"
          min={1}
          max={99}
          value={cutsPerMonth}
          onChange={(e) => setCutsPerMonth(e.target.value)}
          placeholder="Cortes/mes"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50 sm:col-span-2 lg:col-span-4"
        >
          {saving ? 'Guardando…' : 'Agregar plan'}
        </button>
      </form>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          Cargando planes…
        </p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-zinc-400">Todavía no hay planes. Creá el primero arriba.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {plans.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              {editingId === p.id ? (
                <div className="grid flex-1 gap-2 sm:grid-cols-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={editCuts}
                    onChange={(e) => setEditCuts(e.target.value)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-600 sm:col-span-3">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    Activo (se puede asignar a clientes)
                  </label>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-zinc-900">
                    {p.name}
                    {!p.active && (
                      <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-500">
                        Inactivo
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {p.monthlyPrice} · {p.cutsPerMonth} corte{p.cutsPerMonth === 1 ? '' : 's'}/mes
                  </p>
                </div>
              )}
              <div className="flex shrink-0 gap-2">
                {editingId === p.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void saveEdit(p.id)}
                      className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50"
                      aria-label="Editar"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removePlan(p)}
                      className="rounded-lg border border-red-100 p-2 text-red-600 hover:bg-red-50"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
