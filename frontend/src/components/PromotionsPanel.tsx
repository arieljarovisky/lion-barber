import React, { useState } from 'react';
import { Loader2, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import { useConfirm } from '../contexts/ConfirmContext';
import type { SitePromotion } from '../api';

type PromotionsPanelProps = {
  promotions: SitePromotion[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

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
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBadgeText, setEditBadgeText] = useState('');
  const [editCtaLabel, setEditCtaLabel] = useState('');
  const [editCtaHref, setEditCtaHref] = useState('');
  const [editActive, setEditActive] = useState(true);

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
      });
      setTitle('');
      setDescription('');
      setBadgeText('');
      setCtaLabel('Ver abonos');
      setCtaHref('#abonos');
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
            Las promociones activas se muestran en la web pública. Podés enlazar a abonos, reservas u otra sección.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void addPromotion(e)} className="mb-8 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (ej. 20% off en abonos)"
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
          placeholder="Enlace (ej. #abonos)"
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm sm:col-span-2"
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
