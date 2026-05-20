/** Propina en ARS (≥ 0, 2 decimales). No se factura con AFIP. */
export function normalizeTipAmount(n: number): number {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('La propina debe ser un número ≥ 0.');
  }
  return Math.round(n * 100) / 100;
}

/** Parsea campo de API; `undefined` = no enviado. */
export function parseTipAmountBody(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(n)) {
    throw new Error('Propina inválida.');
  }
  return normalizeTipAmount(n);
}
