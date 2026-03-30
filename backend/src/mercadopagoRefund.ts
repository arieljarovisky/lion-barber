import { MercadoPagoConfig, PaymentRefund } from 'mercadopago';

function getMpConfig(): MercadoPagoConfig | null {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token?.trim()) return null;
  return new MercadoPagoConfig({ accessToken: token.trim() });
}

/** Reembolso total del pago (seña) vía API de Mercado Pago. */
export async function refundPaymentTotal(paymentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getMpConfig();
  if (!config) {
    return {
      ok: false,
      error: 'Mercado Pago no está configurado en el servidor; no se puede reembolsar la seña.',
    };
  }
  const refundClient = new PaymentRefund(config);
  try {
    await refundClient.total({ payment_id: paymentId });
    return { ok: true };
  } catch (e) {
    console.error('[MP] refund total', paymentId, e);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `No se pudo completar el reembolso (${msg}). Probá más tarde o contactá al local.`,
    };
  }
}
