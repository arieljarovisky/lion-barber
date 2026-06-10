/** Convierte días de vigencia del plan a texto en meses (base 30 días). */
export function formatSubscriptionValidityMonths(
  validityDays: number | null | undefined
): { headline: string; detail: string } {
  if (validityDays == null || validityDays <= 0) {
    return {
      headline: 'Sin vencimiento por fecha',
      detail: 'El abono termina cuando uses todos los cortes incluidos.',
    };
  }

  const monthsExact = validityDays / 30;
  if (Number.isInteger(monthsExact)) {
    const m = monthsExact;
    const headline = m === 1 ? '1 mes de vigencia' : `${m} meses de vigencia`;
    return {
      headline,
      detail:
        m === 1
          ? 'Tenés 1 mes calendario para usar tus cortes (o hasta agotarlos, lo que ocurra primero).'
          : `Tenés ${m} meses calendario para usar tus cortes (o hasta agotarlos, lo que ocurra primero).`,
    };
  }

  const rounded = Math.round(monthsExact * 10) / 10;
  const headline =
    rounded === 1 ? '1 mes de vigencia' : `${String(rounded).replace('.', ',')} meses de vigencia`;
  return {
    headline,
    detail: `Aproximadamente ${headline.replace(' de vigencia', '')} para usar tus cortes (o hasta agotarlos, lo que ocurra primero).`,
  };
}
