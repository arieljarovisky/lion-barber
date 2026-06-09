import React, { useState } from 'react';
import { Loader2, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import { useConfirm } from '../contexts/ConfirmContext';
import type { SitePromotion } from '../api';
import {
  formatActiveWeekdays,
  toggleWeekdayInList,
  WEEKDAY_OPTIONS,
} from '../utils/sitePromotions';

type PromotionsPanelProps = {
  promotions: SitePromotion[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {WEEKDAY_OPTIONS.map(({ value: day, label }) => {
        const selected = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onChange(toggleWeekdayInList(value, day))}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              selected
                ? 'bg-zinc-900 text-white'
                : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PromotionScheduleFields({
  activeWeekdays,
  onActiveWeekdaysChange,
  discountPercent,
  onDiscountPercentChange,
  depositCoversFull,
  onDepositCoversFullChange,
}: {
  activeWeekdays: number[];
  onActiveWeekdaysChange: (days: number[]) => void;
  discountPercent: string;
  onDiscountPercentChange: (v: string) => void;
  depositCoversFull: boolean;
  onDepositCoversFullChange: (v: boolean) => void;
}) {
  const hasDiscount = discountPercent.trim() !== '' && Number(discountPercent) > 0;

  return (
    <div className="grid gap-3 sm:col-span-2">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
          Días activos
        </p>
        <WeekdayPicker value={activeWeekdays} onChange={onActiveWeekdaysChange} />
        <p className="mt-1.5 text-[11px] text-zinc-400">
          Sin selección = todos los días. Ej.: solo lunes para promo semanal.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-500">
            Precio promocional (% del servicio)
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={discountPercent}
            onChange={(e) => onDiscountPercentChange(e.target.value)}
            placeholder="Ej. 50 = pagás la mitad"
            className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
          />
        </div>
        <label
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            hasDiscount ? 'border-zinc-200 text-zinc-700' : 'border-zinc-100 text-zinc-400'
          }`}
        >
          <input
            type="checkbox"
            checked={depositCoversFull}
            disabled={!hasDiscount}
            onChange={(e) => onDepositCoversFullChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-bold">La seña cubre todo</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              El cliente paga online el % promocional y no debe nada en el local.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

export default function PromotionsPanel({
  promotions,
  loading,
  onRefresh,
  showToast,
}: PromotionsPanelProps) {
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [badgeText, setBadgeText] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Ver abonos');
  const [ctaHref, setCtaHref] = useState('#abonos');
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>([]);
  const [discountPercent, setDiscountPercent] = useState('');
  const [depositCoversFull, setDepositCoversFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBadgeText, setEditBadgeText] = useState('');
  const [editCtaLabel, setEditCtaLabel] = useState('');
  const [editCtaHref, setEditCtaHref] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editActiveWeekdays, setEditActiveWeekdays] = useState<number[]>([]);
  const [editDiscountPercent, setEditDiscountPercent] = useState('');
  const [editDepositCoversFull, setEditDepositCoversFull] = useState(false);

  const parseDiscount = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(100, Math.max(1, Math.round(n)));
  };

  const addPromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      showToast('Escribí el título de la promoción', 'err');
      return;
    }
    setSaving(true);
    try {
      await api.createPromotion({
        title: trimmed,
        description: description.trim(),
        badgeText: badgeText.trim(),
        ctaLabel: ctaLabel.trim() || undefined,
        ctaHref: ctaHref.trim() || undefined,
        activeWeekdays,
        discountPercent: parseDiscount(discountPercent),
        depositCoversFull: depositCoversFull && parseDiscount(discountPercent) != null,
      });
      setTitle('');
      setDescription('');
      setBadgeText('');
      setCtaLabel('Ver abonos');
      setCtaHref('#abonos');
      setActiveWeekdays([]);
      setDiscountPercent('');
      setDepositCoversFull(false);
      showToast('Promoción creada');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo crear la promoción', 'err');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: SitePromotion) => {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditDescription(p.description);
    setEditBadgeText(p.badgeText);
    setEditCtaLabel(p.ctaLabel || 'Ver abonos');
    setEditCtaHref(p.ctaHref || '#abonos');
    setEditActive(p.active);
    setEditActiveWeekdays(p.activeWeekdays ?? []);
    setEditDiscountPercent(p.discountPercent != null ? String(p.discountPercent) : '');
    setEditDepositCoversFull(Boolean(p.depositCoversFull));
  };

  const saveEdit = async (id: string) => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      showToast('El título no puede estar vacío', 'err');
      return;
    }
    try {
      await api.updatePromotion(id, {
        title: trimmed,
        description: editDescription.trim(),
        badgeText: editBadgeText.trim(),
        ctaLabel: editCtaLabel.trim(),
        ctaHref: editCtaHref.trim(),
        active: editActive,
        activeWeekdays: editActiveWeekdays,
        discountPercent: parseDiscount(editDiscountPercent),
        depositCoversFull:
          editDepositCoversFull && parseDiscount(editDiscountPercent) != null,
      });
      setEditingId(null);
      showToast('Promoción actualizada');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error al guardar', 'err');
    }
  };

  const removePromotion = async (p: SitePromotion) => {
    const ok = await confirm({
      title: 'Eliminar promoción',
      message: `¿Eliminar «${p.title}»?`,
    });
    if (!ok) return;
    try {
      await api.deletePromotion(p.id);
      showToast('Promoción eliminada');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo eliminar', 'err');
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5c185]/20 text-[#8a6d3b]">
          <Megaphone size={22} />
        </div>
        <div>
          <h2 className="text-lg font-black text-zinc-900">Promociones del sitio</h2>
          <p className="text-sm text-zinc-500">
            Configurá banners y descuentos por día. Podés hacer que pagando la seña online quede
            todo pago en el local.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void addPromotion(e)} className="mb-8 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (ej. 50% los lunes)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:col-span-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción breve para el banner"
          rows={2}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:col-span-2"
        />
        <input
          type="text"
          value={badgeText}
          onChange={(e) => setBadgeText(e.target.value)}
          placeholder="Etiqueta (ej. OFERTA)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <input
          type="text"
          value={ctaLabel}
          onChange={(e) => setCtaLabel(e.target.value)}
          placeholder="Texto del botón"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        />
        <input
          type="text"
          value={ctaHref}
          onChange={(e) => setCtaHref(e.target.value)}
          placeholder="Enlace (ej. #reservar)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:col-span-2"
        />
        <PromotionScheduleFields
          activeWeekdays={activeWeekdays}
          onActiveWeekdaysChange={setActiveWeekdays}
          discountPercent={discountPercent}
          onDiscountPercentChange={setDiscountPercent}
          depositCoversFull={depositCoversFull}
          onDepositCoversFullChange={setDepositCoversFull}
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50 sm:col-span-2"
        >
          {saving ? 'Guardando…' : 'Agregar promoción'}
        </button>
      </form>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          Cargando promociones…
        </p>
      ) : promotions.length === 0 ? (
        <p className="text-sm text-zinc-400">No hay promociones. Creá la primera arriba.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {promotions.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              {editingId === p.id ? (
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <input
                    value={editBadgeText}
                    onChange={(e) => setEditBadgeText(e.target.value)}
                    placeholder="Etiqueta"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={editCtaLabel}
                    onChange={(e) => setEditCtaLabel(e.target.value)}
                    placeholder="Texto botón"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={editCtaHref}
                    onChange={(e) => setEditCtaHref(e.target.value)}
                    placeholder="Enlace"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <PromotionScheduleFields
                    activeWeekdays={editActiveWeekdays}
                    onActiveWeekdaysChange={setEditActiveWeekdays}
                    discountPercent={editDiscountPercent}
                    onDiscountPercentChange={setEditDiscountPercent}
                    depositCoversFull={editDepositCoversFull}
                    onDepositCoversFullChange={setEditDepositCoversFull}
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-600 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    Activa (visible en la web)
                  </label>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-zinc-900">
                    {p.title}
                    {!p.active && (
                      <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-500">
                        Inactiva
                      </span>
                    )}
                    {p.badgeText && (
                      <span className="ml-2 rounded bg-[#e5c185]/30 px-2 py-0.5 text-[10px] font-bold uppercase text-[#8a6d3b]">
                        {p.badgeText}
                      </span>
                    )}
                  </p>
                  {p.description && <p className="mt-1 text-sm text-zinc-500">{p.description}</p>}
                  <p className="mt-1 text-xs text-zinc-400">
                    Días: {formatActiveWeekdays(p.activeWeekdays ?? [])}
                    {p.discountPercent != null && p.discountPercent > 0 && (
                      <>
                        {' · '}
                        Precio {p.discountPercent}% del servicio
                        {p.depositCoversFull ? ' · seña = todo pago' : ''}
                      </>
                    )}
                  </p>
                  {(p.ctaLabel || p.ctaHref) && (
                    <p className="mt-1 text-xs text-zinc-400">
                      CTA: {p.ctaLabel || '—'} → {p.ctaHref || '—'}
                    </p>
                  )}
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
                      onClick={() => void removePromotion(p)}
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
