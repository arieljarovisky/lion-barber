import React from 'react';
import type { SitePromotion } from '../api';
import { formatActiveWeekdays } from '../utils/sitePromotions';

type SitePromotionBannerProps = {
  promotions: SitePromotion[];
};

function promoDiscountLabel(promo: SitePromotion): string | null {
  if (promo.discountPercent != null && promo.discountPercent > 0) {
    return `${promo.discountPercent}%`;
  }
  return null;
}

export default function SitePromotionBanner({ promotions }: SitePromotionBannerProps) {
  if (promotions.length === 0) return null;

  return (
    <section className="border-y border-[#e5c185]/20 bg-gradient-to-r from-[#e5c185]/10 via-zinc-900 to-[#e5c185]/10 px-4 py-6 sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {promotions.map((promo) => {
          const discountLabel = promoDiscountLabel(promo);
          return (
            <article
              key={promo.id}
              className="flex aspect-square flex-col rounded-2xl border border-[#e5c185]/30 bg-zinc-950/80 p-4 shadow-lg sm:p-5"
            >
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                {discountLabel ? (
                  <div className="mb-2 flex flex-col items-center leading-none">
                    <span className="font-sans text-5xl font-black tabular-nums tracking-tight text-[#e5c185] sm:text-6xl">
                      {discountLabel}
                    </span>
                    <span className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#e5c185]/80">
                      descuento
                    </span>
                  </div>
                ) : promo.badgeText ? (
                  <span className="mb-2 rounded-full bg-[#e5c185] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-zinc-950">
                    {promo.badgeText}
                  </span>
                ) : null}

                <h2 className="line-clamp-2 text-base font-black text-white sm:text-lg">{promo.title}</h2>

                {promo.description && (
                  <p className="mt-2 line-clamp-3 text-xs text-zinc-400 sm:text-sm">{promo.description}</p>
                )}

                {(promo.activeWeekdays?.length || promo.discountPercent) && (
                  <p className="mt-2 line-clamp-2 text-[10px] text-zinc-500 sm:text-xs">
                    {promo.discountPercent != null && promo.discountPercent > 0 ? (
                      <>
                        Al reservar:{' '}
                        {promo.activeWeekdays?.length
                          ? formatActiveWeekdays(promo.activeWeekdays)
                          : 'todos los días'}
                        {promo.depositCoversFull ? ' · seña = todo pago' : ''}
                      </>
                    ) : promo.activeWeekdays?.length ? (
                      <>Vigente: {formatActiveWeekdays(promo.activeWeekdays)}</>
                    ) : null}
                  </p>
                )}
              </div>

              {(promo.ctaLabel || promo.ctaHref) && (
                <a
                  href={promo.ctaHref || '#reserva'}
                  className="mt-3 inline-flex w-full shrink-0 items-center justify-center rounded-xl bg-[#e5c185] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-950 transition-colors hover:bg-[#d4b074] sm:text-xs"
                >
                  {promo.ctaLabel || 'Ver más'}
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
