import React from 'react';
import { Check, Loader2, Star } from 'lucide-react';
import { formatCatalogPriceArs } from '../utils/money';

type SubscriptionPricingCardsProps = {
  plans: import('../api').SubscriptionPlan[];
  loading: boolean;
  checkoutPlanId: string | null;
  checkoutLoading: boolean;
  onContinue: (plan: import('../api').SubscriptionPlan) => void;
  isLoggedIn: boolean;
  onLoginRequired: () => void;
};

export function SubscriptionPricingCards({
  plans,
  loading,
  checkoutPlanId,
  checkoutLoading,
  onContinue,
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
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-4 xl:gap-5">
      {plans.map((plan) => {
        const highlighted = Boolean(plan.highlighted);
        const features = plan.features ?? [];
        const isBuying = checkoutLoading && checkoutPlanId === plan.id;

        return (
          <article
            key={plan.id}
            className={`group relative flex h-full flex-col rounded-xl border p-4 transition-colors sm:rounded-2xl sm:p-5 lg:p-4 xl:p-5 ${
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
              {plan.category?.replace(/^Abono mensual$/i, 'Abono') || 'Abono'}
            </p>
            <h3 className="mt-2 font-serif text-lg font-black uppercase tracking-tight text-white sm:text-xl lg:text-base xl:text-lg">
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
                    <span className="text-sm text-zinc-500 line-through">
                      {formatCatalogPriceArs(plan.compareAtPrice)}
                    </span>
                  )}
                  {plan.discountLabel && (
                    <span className="rounded-full border border-[#e5c185]/30 bg-[#e5c185]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#e5c185]">
                      {plan.discountLabel}
                    </span>
                  )}
                </div>
              )}
              <p className="font-sans text-2xl font-black text-[#e5c185] sm:text-3xl lg:text-xl xl:text-2xl">
                {formatCatalogPriceArs(plan.monthlyPrice)}
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
                onContinue(plan);
              }}
              className="mt-5 w-full rounded-xl border-2 border-black bg-[#e5c185] py-3 font-sans text-xs font-black uppercase tracking-wider text-zinc-950 transition-all hover:bg-[#d4b074] hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100 lg:py-2.5 xl:py-3 xl:text-sm"
            >
              {isBuying ? 'Preparando pago…' : 'Continuar'}
            </button>

            <ul className="mt-5 flex flex-1 flex-col gap-2.5 border-t border-zinc-800 pt-5 lg:gap-2 lg:pt-4">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-zinc-300 lg:text-xs xl:text-sm">
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
