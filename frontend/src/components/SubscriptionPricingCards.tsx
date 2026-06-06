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
        <Loader2 size={20} className="animate-spin" />
        Cargando abonos…
      </div>
    );
  }

  if (plans.length === 0) return null;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => {
        const highlighted = Boolean(plan.highlighted);
        const features = plan.features ?? [];
        const isBuying = checkoutLoading && checkoutPlanId === plan.id;

        return (
          <article
            key={plan.id}
            className={`relative flex flex-col rounded-2xl bg-white p-6 shadow-md ${
              highlighted
                ? 'ring-2 ring-transparent [background:linear-gradient(white,white)_padding-box,linear-gradient(135deg,#ec4899,#3b82f6)_border-box] border-2 border-transparent'
                : 'border border-zinc-200'
            }`}
          >
            {plan.badgeText && (
              <div className="absolute -top-3 right-4 rounded-full bg-gradient-to-r from-pink-500 to-blue-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow">
                {plan.badgeText}
              </div>
            )}

            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {plan.category || 'Abono mensual'}
            </p>
            <h3 className="mt-1 text-2xl font-black text-zinc-900">{plan.name}</h3>
            {plan.description && (
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{plan.description}</p>
            )}

            <div className="mt-5 min-h-[88px]">
              {(plan.compareAtPrice || plan.discountLabel) && (
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {plan.compareAtPrice && (
                    <span className="text-sm text-zinc-400 line-through">{plan.compareAtPrice}</span>
                  )}
                  {plan.discountLabel && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600">
                      {plan.discountLabel}
                    </span>
                  )}
                </div>
              )}
              <p className="text-4xl font-black tracking-tight text-zinc-900">
                {plan.monthlyPrice}
                <span className="text-base font-semibold text-zinc-500">/mes</span>
              </p>
              {plan.bonusText && (
                <p className="mt-1 text-xs font-medium text-emerald-600">{plan.bonusText}</p>
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
              className="mt-5 w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-black uppercase tracking-wider text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
            >
              {isBuying ? 'Preparando pago…' : 'Continuar'}
            </button>

            <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-zinc-100 pt-6">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-zinc-700">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
              {highlighted && (
                <li className="flex items-start gap-2.5 text-sm font-semibold text-pink-600">
                  <Star size={16} className="mt-0.5 shrink-0" aria-hidden />
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
