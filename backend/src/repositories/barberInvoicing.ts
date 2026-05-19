import { query } from '../db.js';

/** Total facturado AFIP por barbero en un año calendario (por fecha de emisión). */
export async function getInvoicedTotalsByBarberYear(year: number): Promise<Map<string, number>> {
  const start = `${year}-01-01 00:00:00`;
  const end = `${year + 1}-01-01 00:00:00`;
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

export async function getInvoicedTotalForBarberYear(barberId: string, year: number): Promise<number> {
  const all = await getInvoicedTotalsByBarberYear(year);
  return all.get(barberId) ?? 0;
}
