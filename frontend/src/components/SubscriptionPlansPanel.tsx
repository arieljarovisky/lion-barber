import React, { useState } from 'react';
import { Loader2, Pencil, Repeat, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import { useConfirm } from '../contexts/ConfirmContext';
import type { SubscriptionPlan } from '../api';
import { formatCatalogPriceArs } from '../utils/money';

type SubscriptionPlansPanelProps = {
  plans: SubscriptionPlan[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

function featuresToText(features?: string[]): string {
  return (features ?? []).join('\n');
}

function parseOptionalValidityDays(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(999, n);
}

function textToFeatures(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

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
  const [validityDays, setValidityDays] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Abono mensual');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');
  const [bonusText, setBonusText] = useState('');
  const [badgeText, setBadgeText] = useState('');
  const [featuresText, setFeaturesText] = useState('');
  const [highlighted, setHighlighted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCuts, setEditCuts] = useState('');
  const [editValidityDays, setEditValidityDays] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCompareAtPrice, setEditCompareAtPrice] = useState('');
  const [editDiscountLabel, setEditDiscountLabel] = useState('');
  const [editBonusText, setEditBonusText] = useState('');
  const [editBadgeText, setEditBadgeText] = useState('');
  const [editFeaturesText, setEditFeaturesText] = useState('');
  const [editHighlighted, setEditHighlighted] = useState(false);
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
      showToast('Los cortes incluidos deben ser al menos 1', 'err');
      return;
    }
    setSaving(true);
    try {
      await api.createSubscriptionPlan({
        name: trimmed,
        monthlyPrice: price,
        cutsPerMonth: cuts,
        validityDays: parseOptionalValidityDays(validityDays),
        description: description.trim(),
        category: category.trim(),
        compareAtPrice: compareAtPrice.trim(),
        discountLabel: discountLabel.trim(),
        bonusText: bonusText.trim(),
        badgeText: badgeText.trim(),
        features: textToFeatures(featuresText),
        highlighted,
      });
      setName('');
      setMonthlyPrice('');
      setCutsPerMonth('4');
      setValidityDays('');
      setDescription('');
      setCategory('Abono mensual');
      setCompareAtPrice('');
      setDiscountLabel('');
      setBonusText('');
      setBadgeText('');
      setFeaturesText('');
      setHighlighted(false);
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
    setEditValidityDays(p.validityDays != null ? String(p.validityDays) : '');
    setEditDescription(p.description ?? '');
    setEditCategory(p.category ?? 'Abono mensual');
    setEditCompareAtPrice(p.compareAtPrice ?? '');
    setEditDiscountLabel(p.discountLabel ?? '');
    setEditBonusText(p.bonusText ?? '');
    setEditBadgeText(p.badgeText ?? '');
    setEditFeaturesText(featuresToText(p.features));
    setEditHighlighted(Boolean(p.highlighted));
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
      showToast('Cortes incluidos inválidos', 'err');
      return;
    }
    try {
      await api.updateSubscriptionPlan(id, {
        name: trimmed,
        monthlyPrice: editPrice.trim(),
        cutsPerMonth: cuts,
        validityDays: parseOptionalValidityDays(editValidityDays),
        active: editActive,
        description: editDescription.trim(),
        category: editCategory.trim(),
        compareAtPrice: editCompareAtPrice.trim(),
        discountLabel: editDiscountLabel.trim(),
        bonusText: editBonusText.trim(),
        badgeText: editBadgeText.trim(),
        features: textToFeatures(editFeaturesText),
        highlighted: editHighlighted,
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
            Configurá los abonos que se muestran en la web y podés asignar manualmente desde la ficha de cada cliente.
            Por defecto el abono termina al usar todos los cortes; opcionalmente podés limitar la vigencia en días.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void addPlan(e)} className="mb-8 grid gap-3 sm:grid-cols-2">
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
          placeholder="Cortes incluidos"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <input
          type="number"
          min={1}
          max={999}
          value={validityDays}
          onChange={(e) => setValidityDays(e.target.value)}
          placeholder="Vigencia en días (vacío = sin vencimiento)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:col-span-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción para la tarjeta en la web"
          rows={2}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:col-span-2"
        />
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Categoría (ej. Abono mensual)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <input
          type="text"
          value={compareAtPrice}
          onChange={(e) => setCompareAtPrice(e.target.value)}
          placeholder="Precio tachado ($100.000)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <input
          type="text"
          value={discountLabel}
          onChange={(e) => setDiscountLabel(e.target.value)}
          placeholder="Etiqueta de descuento (AHORRA 20%)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <input
          type="text"
          value={bonusText}
          onChange={(e) => setBonusText(e.target.value)}
          placeholder="Bonus (Incluye GRATIS 1 mes)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <input
          type="text"
          value={badgeText}
          onChange={(e) => setBadgeText(e.target.value)}
          placeholder="Badge destacado (RECOMENDADO)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <textarea
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          placeholder="Características (una por línea). Si queda vacío, se generan automáticamente."
          rows={3}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:col-span-2"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-600 sm:col-span-2">
          <input type="checkbox" checked={highlighted} onChange={(e) => setHighlighted(e.target.checked)} />
          Destacar en la web (borde especial)
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50 sm:col-span-2"
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
            <li key={p.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              {editingId === p.id ? (
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
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
                    placeholder="Cortes incluidos"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={editValidityDays}
                    onChange={(e) => setEditValidityDays(e.target.value)}
                    placeholder="Vigencia en días (vacío = sin vencimiento)"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <input
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="Categoría"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={editCompareAtPrice}
                    onChange={(e) => setEditCompareAtPrice(e.target.value)}
                    placeholder="Precio tachado"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={editDiscountLabel}
                    onChange={(e) => setEditDiscountLabel(e.target.value)}
                    placeholder="Descuento"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={editBonusText}
                    onChange={(e) => setEditBonusText(e.target.value)}
                    placeholder="Bonus"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={editBadgeText}
                    onChange={(e) => setEditBadgeText(e.target.value)}
                    placeholder="Badge"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <textarea
                    value={editFeaturesText}
                    onChange={(e) => setEditFeaturesText(e.target.value)}
                    rows={3}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={editHighlighted}
                      onChange={(e) => setEditHighlighted(e.target.checked)}
                    />
                    Destacado en la web
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    Activo
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
                    {p.highlighted && (
                      <span className="ml-2 rounded bg-pink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-pink-700">
                        Destacado
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {formatCatalogPriceArs(p.monthlyPrice)} · {p.cutsPerMonth} corte{p.cutsPerMonth === 1 ? '' : 's'}
                    {p.validityDays != null ? ` · ${p.validityDays} días de vigencia` : ' · sin vencimiento por fecha'}
                  </p>
                  {p.description && <p className="mt-1 text-xs text-zinc-400">{p.description}</p>}
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
