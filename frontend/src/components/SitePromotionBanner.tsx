import React from 'react';
import { Sparkles } from 'lucide-react';
import type { SitePromotion } from '../api';
import { formatActiveWeekdays } from '../utils/sitePromotions';

type SitePromotionBannerProps = {
  promotions: SitePromotion[];
};

export default function SitePromotionBanner({ promotions }: SitePromotionBannerProps) {
  if (promotions.length === 0) return null;

  return (
    <section className="border-y border-[#e5c185]/20 bg-gradient-to-r from-[#e5c185]/10 via-zinc-900 to-[#e5c185]/10 px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {promotions.map((promo) => (
          <article
            key={promo.id}
            className="flex flex-col items-start gap-4 rounded-2xl border border-[#e5c185]/30 bg-zinc-950/80 p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {promo.badgeText && (
                  <span className="rounded-full bg-[#e5c185] px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-950">
                    {promo.badgeText}
                  </span>
                )}
                <Sparkles size={16} className="text-[#e5c185]" aria-hidden />
              </div>
              <h2 className="text-lg font-black text-white sm:text-xl">{promo.title}</h2>
              {promo.description && (
                <p className="mt-1 text-sm text-zinc-300 sm:text-base">{promo.description}</p>
              )}
              {(promo.activeWeekdays?.length || promo.discountPercent) && (
                <p className="mt-2 text-xs text-zinc-400">
                  {promo.activeWeekdays?.length ? (
                    <span>Válida: {formatActiveWeekdays(promo.activeWeekdays)}</span>
                  ) : null}
                  {promo.discountPercent != null && promo.discountPercent > 0 && (
                    <span>
                      {promo.activeWeekdays?.length ? ' · ' : ''}
                      {promo.discountPercent}% del servicio
                      {promo.depositCoversFull ? ' pagando la seña online' : ''}
                    </span>
                  )}
                </p>
              )}
            </div>
            {(promo.ctaLabel || promo.ctaHref) && (
              <a
                href={promo.ctaHref || '#reserva'}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#e5c185] px-5 py-3 text-xs font-black uppercase tracking-wider text-zinc-950 transition-colors hover:bg-[#d4b074]"
              >
                {promo.ctaLabel || 'Ver más'}
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
