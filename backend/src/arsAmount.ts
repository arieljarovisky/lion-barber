/**
 * Convierte un texto con un importe en pesos (ej. "$ 20.000", "$1.500,50",
 * "20000", "20,000.50") al número decimal correspondiente.
 * Devuelve `null` si no se puede inferir un valor positivo.
 */
export function parseArsAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const text = String(raw);
  if (!text) return null;
  const cleaned = text.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized = cleaned;
  if (hasDot && hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/\./g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
