import { query } from '../db.js';

function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0');
  const start = `${year}-${mm}-01 00:00:00`;
  if (month === 12) {
    return { start, end: `${year + 1}-01-01 00:00:00` };
  }
  const nextMm = String(month + 1).padStart(2, '0');
  return { start, end: `${year}-${nextMm}-01 00:00:00` };
}

/** Total facturado AFIP por barbero en un mes calendario (por fecha de emisión). */
export async function getInvoicedTotalsByBarberMonth(
  year: number,
  month: number
): Promise<Map<string, number>> {
  const { start, end } = monthRange(year, month);
  const rows = await query<{ barber_id: string; total: string | number }[]>(
    `SELECT barber_id,
      SUM(
        COALESCE(
          CAST(JSON_UNQUOTE(JSON_EXTRACT(afip_invoice_detail, '$.total')) AS DECIMAL(14,2)),
          0
        )
      ) AS total
     FROM appointments
     WHERE afip_cae IS NOT NULL
       AND barber_id IS NOT NULL
       AND afip_facturado_at >= ?
       AND afip_facturado_at < ?
     GROUP BY barber_id`,
    [start, end]
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    const id = String(r.barber_id ?? '').trim();
    if (!id) continue;
    const n = Number(r.total);
    map.set(id, Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
  }
  return map;
}

export async function getInvoicedTotalForBarberMonth(
  barberId: string,
  year: number,
  month: number
): Promise<number> {
  const all = await getInvoicedTotalsByBarberMonth(year, month);
  return all.get(barberId) ?? 0;
}
