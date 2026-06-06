import React from 'react';
import { Check, Loader2, Star } from 'lucide-react';

type SubscriptionPricingCardsProps = {
  plans: import('../api').SubscriptionPlan[];
  loading: boolean;
  checkoutPlanId: string | null;
  checkoutLoading: boolean;
  onBuy: (planId: string) => void;
  isLoggedIn: boolean;
  onLoginRequired: () => void;
};

export function SubscriptionPricingCards({
  plans,
  loading,
  checkoutPlanId,
  checkoutLoading,
  onBuy,
  isLoggedIn,
  onLoginRequired,
}: SubscriptionPricingCardsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
        <Loader2 size={20} className="animate-spin text-[#e5c185]" />
        Cargando abonos…
      </div>
    );
  }

  if (plans.length === 0) return null;

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:gap-8 lg:grid-cols-3">
      {plans.map((plan) => {
        const highlighted = Boolean(plan.highlighted);
        const features = plan.features ?? [];
        const isBuying = checkoutLoading && checkoutPlanId === plan.id;

        return (
          <article
            key={plan.id}
            className={`group relative flex flex-col rounded-xl border p-5 transition-colors sm:rounded-2xl sm:p-6 md:p-8 ${
              highlighted
                ? 'border-[#e5c185]/60 bg-zinc-900/70 shadow-[0_0_40px_-12px_rgba(229,193,133,0.35)] hover:border-[#e5c185]'
                : 'border-zinc-800 bg-zinc-900/50 hover:border-[#e5c185]/50'
            }`}
          >
            {plan.badgeText && (
              <div className="absolute -top-3 right-4 rounded-full border border-[#e5c185]/40 bg-zinc-950 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#e5c185]">
                {plan.badgeText}
              </div>
            )}

            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {plan.category || 'Abono mensual'}
            </p>
            <h3 className="mt-2 font-serif text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
              {plan.name}
            </h3>
            {plan.description && (
              <p className="mt-2 font-sans text-sm font-light leading-relaxed text-zinc-400">
                {plan.description}
              </p>
            )}

            <div className="mt-5 min-h-[72px]">
              {(plan.compareAtPrice || plan.discountLabel) && (
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {plan.compareAtPrice && (
                    <span className="text-sm text-zinc-500 line-through">{plan.compareAtPrice}</span>
                  )}
                  {plan.discountLabel && (
                    <span className="rounded-full border border-[#e5c185]/30 bg-[#e5c185]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#e5c185]">
                      {plan.discountLabel}
                    </span>
                  )}
                </div>
              )}
              <p className="font-sans text-3xl font-black text-[#e5c185] sm:text-4xl">
                {plan.monthlyPrice}
                <span className="text-base font-semibold text-zinc-500">/mes</span>
              </p>
              {plan.bonusText && (
                <p className="mt-1 text-xs font-medium text-[#e5c185]/80">{plan.bonusText}</p>
              )}
            </div>

            <button
              type="button"
              disabled={isBuying}
              onClick={() => {
                if (!isLoggedIn) {
                  onLoginRequired();
                  return;
                }
                onBuy(plan.id);
              }}
              className="mt-5 w-full rounded-xl border-2 border-black bg-[#e5c185] py-3.5 font-sans text-sm font-black uppercase tracking-wider text-zinc-950 transition-all hover:bg-[#d4b074] hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
            >
              {isBuying ? 'Preparando pago…' : 'Continuar'}
            </button>

            <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-zinc-800 pt-6">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <Check size={16} className="mt-0.5 shrink-0 text-[#e5c185]" aria-hidden />
                  <span className="font-sans font-light">{feature}</span>
                </li>
              ))}
              {highlighted && (
                <li className="flex items-start gap-2.5 text-sm font-semibold text-[#e5c185]">
                  <Star size={16} className="mt-0.5 shrink-0 fill-[#e5c185]/20" aria-hidden />
                  <span>Plan recomendado</span>
                </li>
              )}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
