import { Payment, MercadoPagoConfig } from 'mercadopago';
import { parseArsAmount } from '../arsAmount.js';
import { query } from '../db.js';
import { dbDateTimeToIsoUtc } from '../dbDateTime.js';
import { parseMercadoPagoTransactionAmountArs } from '../mercadopagoAmount.js';
import {
  createCounterSale,
  getCounterSaleByMercadopagoPaymentId,
} from '../repositories/counterSales.js';
import { getSubscriptionPlanById } from '../repositories/subscriptionPlans.js';
import { findUserById } from '../repositories/users.js';
import { currentArgentinaYmd } from './clientSubscription.js';

function getMpConfig(): MercadoPagoConfig | null {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) return null;
  return new MercadoPagoConfig({ accessToken: token });
}

/** Fecha calendario en Argentina para el instante del pago. */
export function argentinaYmdFromInstant(value: unknown): string {
  let date: Date | null = null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    date = value;
  } else if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(dbDateTimeToIsoUtc(value));
    if (Number.isFinite(parsed.getTime())) date = parsed;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) date = parsed;
  }
  const target = date ?? new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  const ymd = `${y}-${m}-${d}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : currentArgentinaYmd();
}

export function mercadoPagoPaidAt(payment: unknown): unknown {
  if (!payment || typeof payment !== 'object') return undefined;
  const p = payment as Record<string, unknown>;
  return p.date_approved ?? p.date_created;
}

/**
 * Anota en la caja un abono cobrado por la web.
 * Idempotente por id de pago de Mercado Pago: no duplica ni comisiona.
 */
export async function recordWebSubscriptionInCash(input: {
  mercadopagoPaymentId: string;
  userId: number;
  planId: string;
  amountArs?: number | null;
  paidAt?: unknown;
}): Promise<boolean> {
  const mpId = input.mercadopagoPaymentId.trim();
  if (!mpId) return false;
  if (await getCounterSaleByMercadopagoPaymentId(mpId)) return false;

  const plan = await getSubscriptionPlanById(input.planId);
  const planPrice = plan ? parseArsAmount(plan.monthlyPrice) : null;
  const charged =
    input.amountArs != null && Number.isFinite(input.amountArs) && input.amountArs > 0
      ? Math.round(input.amountArs)
      : planPrice != null
        ? Math.round(planPrice)
        : 0;
  if (charged <= 0) {
    console.warn(`[caja] abono web ${mpId} sin importe. No se anotó.`);
    return false;
  }

  const user = await findUserById(input.userId);
  const buyerName = user?.name?.trim().slice(0, 120) || 'Cliente web';
  try {
    await createCounterSale({
      saleDate: argentinaYmdFromInstant(input.paidAt),
      buyerName,
      clientUserId: input.userId,
      paymentMethod: 'mercadopago',
      products: [],
      subscriptionPlanId: input.planId,
      subscriptionPlanName: plan?.name?.trim() || 'Abono',
      subscriptionGroupId: null,
      subscriptionAmountArs: charged,
      createdByUserId: null,
      createdByName: 'Web',
      saleChannel: 'web',
      mercadopagoPaymentId: mpId,
    });
    return true;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return false;
    throw e;
  }
}

/** Pasa a la caja los abonos web ya cobrados que todavía no tenían movimiento. */
export async function backfillWebSubscriptionCashSales(): Promise<void> {
  const rows = await query<
    {
      mercadopago_payment_id: string;
      user_id: number;
      plan_id: string;
      created_at: string;
    }[]
  >(
    `SELECT e.mercadopago_payment_id, e.user_id, e.plan_id, e.created_at
     FROM subscription_payment_events e
     LEFT JOIN counter_sales c ON c.mercadopago_payment_id = e.mercadopago_payment_id
     WHERE c.id IS NULL
     ORDER BY e.created_at ASC`
  );
  if (!rows.length) return;

  const config = getMpConfig();
  const client = config ? new Payment(config) : null;
  let created = 0;
  for (const row of rows) {
    let amount: number | null = null;
    let paidAt: unknown = row.created_at;
    if (client) {
      try {
        const payment = await client.get({ id: Number(row.mercadopago_payment_id) });
        amount = parseMercadoPagoTransactionAmountArs(payment);
        paidAt = mercadoPagoPaidAt(payment) ?? row.created_at;
      } catch (err) {
        console.warn(
          `[caja] no se pudo leer el pago ${row.mercadopago_payment_id} en Mercado Pago:`,
          err
        );
      }
    }
    try {
      const ok = await recordWebSubscriptionInCash({
        mercadopagoPaymentId: row.mercadopago_payment_id,
        userId: row.user_id,
        planId: row.plan_id,
        amountArs: amount,
        paidAt,
      });
      if (ok) created += 1;
    } catch (err) {
      console.warn(`[caja] no se pudo anotar el abono web ${row.mercadopago_payment_id}:`, err);
    }
  }
  if (created > 0) {
    console.log(`[caja] ${created} abono(s) pagado(s) desde la web sumados a la caja.`);
  }
}
