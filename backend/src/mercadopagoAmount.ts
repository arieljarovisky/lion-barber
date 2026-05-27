/** Importe cobrado en ARS desde la respuesta de GET /v1/payments/{id}. */
export function parseMercadoPagoTransactionAmountArs(payment: unknown): number | null {
  if (!payment || typeof payment !== 'object') return null;
  const p = payment as Record<string, unknown>;
  const details =
    p.transaction_details && typeof p.transaction_details === 'object'
      ? (p.transaction_details as Record<string, unknown>)
      : null;
  const raw = p.transaction_amount ?? details?.total_paid_amount;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
