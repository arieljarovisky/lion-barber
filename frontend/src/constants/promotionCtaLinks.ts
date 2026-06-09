/** Secciones de la web pública (ClientView) a las que puede apuntar el botón de una promoción. */
export const PROMOTION_CTA_LINKS = [
  { href: '#reserva', sectionLabel: 'Reservar turno', defaultButtonText: 'Reservar turno' },
  { href: '#abonos', sectionLabel: 'Abonos mensuales', defaultButtonText: 'Ver abonos' },
  { href: '#servicios', sectionLabel: 'Servicios y precios', defaultButtonText: 'Ver servicios' },
  { href: '#barberos', sectionLabel: 'Nuestro equipo', defaultButtonText: 'Conocé al equipo' },
  { href: '#contacto', sectionLabel: 'Contacto y ubicación', defaultButtonText: 'Cómo llegar' },
] as const;

export function promotionSectionLabel(href: string | null | undefined): string {
  if (!href) return '—';
  const found = PROMOTION_CTA_LINKS.find((l) => l.href === href);
  return found?.sectionLabel ?? href;
}

export function isKnownPromotionCtaHref(href: string): boolean {
  return PROMOTION_CTA_LINKS.some((l) => l.href === href);
}

/** Enlaces viejos o mal escritos → sección actual. */
const LEGACY_CTA_HREF_ALIASES: Record<string, string> = {
  '#reservar': '#reserva',
  '#reservas': '#reserva',
};

export function normalizePromotionCtaHref(href: string | null | undefined): string {
  const raw = (href ?? '').trim();
  if (!raw) return PROMOTION_CTA_LINKS[0].href;
  if (isKnownPromotionCtaHref(raw)) return raw;
  return LEGACY_CTA_HREF_ALIASES[raw.toLowerCase()] ?? PROMOTION_CTA_LINKS[0].href;
}

export function defaultButtonTextForHref(href: string): string {
  return PROMOTION_CTA_LINKS.find((l) => l.href === href)?.defaultButtonText ?? 'Ver más';
}
