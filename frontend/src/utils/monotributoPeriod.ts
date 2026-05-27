const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function formatMonthYearEs(year: number, month: number): string {
  const name = MONTH_NAMES_ES[month - 1] ?? String(month);
  return `${name} ${year}`;
}
