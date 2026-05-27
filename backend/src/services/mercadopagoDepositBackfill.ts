import { Payment, MercadoPagoConfig } from 'mercadopago';
import { query } from '../db.js';
import { parseMercadoPagoTransactionAmountArs } from '../mercadopagoAmount.js';

function getMpConfig(): MercadoPagoConfig | null {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) return null;
  return new MercadoPagoConfig({ accessToken: token });
}

/** Completa deposit_amount_ars en turnos viejos consultando el pago real en Mercado Pago. */
export async function backfillMissingDepositAmountsFromMercadoPago(): Promise<void> {
  const config = getMpConfig();
  if (!config) return;

  const rows = await query<{ id: number; mercadopago_payment_id: string }[]>(
    `SELECT id, mercadopago_payment_id FROM appointments
     WHERE deposit_paid = 1
       AND mercadopago_payment_id IS NOT NULL
       AND mercadopago_payment_id != ''
       AND (deposit_amount_ars IS NULL OR deposit_amount_ars <= 0)
     ORDER BY id DESC
     LIMIT 30`
  );
  if (!rows.length) return;

  const client = new Payment(config);
  let updated = 0;
  for (const row of rows) {
    try {
      const payment = await client.get({ id: Number(row.mercadopago_payment_id) });
      const amount = parseMercadoPagoTransactionAmountArs(payment);
      if (amount == null) continue;
      await query('UPDATE appointments SET deposit_amount_ars = ? WHERE id = ?', [amount, row.id]);
      updated += 1;
    } catch (err) {
      console.warn(`[MP backfill] turno ${row.id} pago ${row.mercadopago_payment_id}:`, err);
    }
  }
  if (updated > 0) {
    console.log(`[MP backfill] Seña real guardada en ${updated} turno(s).`);
  }
}
