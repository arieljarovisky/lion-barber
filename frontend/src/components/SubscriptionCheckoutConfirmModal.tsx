import { Calendar, Scissors, X } from 'lucide-react';
import type { SubscriptionPlan } from '../api';
import { formatCatalogPriceArs } from '../utils/money';
import { formatSubscriptionValidityMonths } from '../utils/subscriptionValidity';

type Props = {
  plan: SubscriptionPlan | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function SubscriptionCheckoutConfirmModal({
  plan,
  loading,
  onClose,
  onConfirm,
}: Props) {
  if (!plan) return null;

  const validity = formatSubscriptionValidityMonths(plan.validityDays);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-confirm-title"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute right-3 top-3 rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 disabled:opacity-50"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>

        <div className="border-b border-zinc-800 px-5 py-5 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e5c185]">Antes de pagar</p>
          <h2 id="subscription-confirm-title" className="mt-1 font-serif text-xl font-black uppercase text-white">
            Confirmá tu abono
          </h2>
          <p className="mt-2 text-sm text-zinc-400">{plan.name}</p>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Precio</p>
            <p className="mt-1 text-2xl font-black text-[#e5c185]">{formatCatalogPriceArs(plan.monthlyPrice)}</p>
          </div>

          <div className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <Scissors size={20} className="mt-0.5 shrink-0 text-[#e5c185]" aria-hidden />
            <div>
              <p className="text-sm font-bold text-white">
                {plan.cutsPerMonth} corte{plan.cutsPerMonth === 1 ? '' : 's'} incluido
                {plan.cutsPerMonth === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-xs text-zinc-400">Reservás sin seña mientras tengas cortes disponibles.</p>
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-[#e5c185]/30 bg-[#e5c185]/10 p-4">
            <Calendar size={20} className="mt-0.5 shrink-0 text-[#e5c185]" aria-hidden />
            <div>
              <p className="text-sm font-bold text-[#e5c185]">{validity.headline}</p>
              <p className="mt-1 text-xs text-zinc-300">{validity.detail}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-zinc-800 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl border-2 border-black bg-[#e5c185] py-3 text-sm font-black uppercase tracking-wide text-zinc-950 hover:bg-[#d4b074] disabled:opacity-60"
          >
            {loading ? 'Preparando…' : 'Ir a Mercado Pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
